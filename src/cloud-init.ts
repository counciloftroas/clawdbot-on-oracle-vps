import * as pulumi from "@pulumi/pulumi";

export interface CloudInitArgs {
    tailscaleOAuthClientId: pulumi.Input<string>;
    tailscaleOAuthClientSecret: pulumi.Input<string>;
    tailscaleTailnet: string;
    tailscaleHostname: string;
    tailscaleTag: string;
}

export function generateCloudInit(args: CloudInitArgs): pulumi.Output<string> {
    return pulumi.interpolate`#cloud-config
package_update: true
package_upgrade: true

packages:
  - curl
  - ca-certificates
  - gnupg
  - jq
  - fail2ban

write_files:
  - path: /etc/systemd/system/clawdbot.service
    content: |
      [Unit]
      Description=Clawdbot Daemon
      After=network.target tailscaled.service
      Wants=tailscaled.service

      [Service]
      Type=simple
      User=ubuntu
      WorkingDirectory=/home/ubuntu
      ExecStart=/usr/bin/npx clawdbot daemon
      Restart=on-failure
      RestartSec=10
      Environment=NODE_ENV=production

      [Install]
      WantedBy=multi-user.target
    permissions: '0644'

  - path: /etc/ssh/sshd_config.d/99-hardening.conf
    content: |
      PasswordAuthentication no
      PermitRootLogin no
      PermitEmptyPasswords no
      MaxAuthTries 3
      LoginGraceTime 20
      X11Forwarding no
      ClientAliveInterval 300
      ClientAliveCountMax 2
    permissions: '0644'

  - path: /etc/fail2ban/jail.local
    content: |
      [sshd]
      enabled = true
      port = 22
      filter = sshd
      logpath = /var/log/auth.log
      maxretry = 5
      bantime = 3600
      findtime = 600
    permissions: '0644'

runcmd:
  # Install Node.js 22
  - curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  - apt-get install -y nodejs

  # Install Tailscale
  - curl -fsSL https://tailscale.com/install.sh | sh

  # Authenticate Tailscale using OAuth client credentials
  # Step 1: Get OAuth access token
  # Step 2: Create auth key via API
  # Step 3: Use auth key to authenticate
  - |
    set -e
    echo "Getting Tailscale OAuth access token..."
    ACCESS_TOKEN=$(curl -s -X POST "https://api.tailscale.com/api/v2/oauth/token" \
      -u "${args.tailscaleOAuthClientId}:${args.tailscaleOAuthClientSecret}" \
      -d "grant_type=client_credentials" | jq -r '.access_token')

    if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
      echo "Failed to get OAuth access token"
      exit 1
    fi

    echo "Creating Tailscale auth key..."
    AUTH_KEY=$(curl -s -X POST "https://api.tailscale.com/api/v2/tailnet/${args.tailscaleTailnet}/keys" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "capabilities": {
          "devices": {
            "create": {
              "reusable": false,
              "ephemeral": false,
              "preauthorized": true,
              "tags": ["tag:${args.tailscaleTag}"]
            }
          }
        },
        "expirySeconds": 300
      }' | jq -r '.key')

    if [ -z "$AUTH_KEY" ] || [ "$AUTH_KEY" = "null" ]; then
      echo "Failed to create auth key"
      exit 1
    fi

    echo "Authenticating Tailscale..."
    tailscale up --auth-key="$AUTH_KEY" --hostname=${args.tailscaleHostname}

    # Enable Tailscale Funnel for webhook ingress
    # This makes the node publicly accessible via https://{hostname}.{tailnet}.ts.net
    # Tailscale terminates TLS at their edge
    echo "Enabling Tailscale Funnel on port 18789..."
    tailscale serve reset || true
    tailscale funnel --bg 18789

  # Install clawdbot globally
  - npm install -g clawdbot@latest

  # Create clawdbot config directory
  - mkdir -p /home/ubuntu/.clawdbot
  - chown -R ubuntu:ubuntu /home/ubuntu/.clawdbot

  # Enable clawdbot service (but don't start - needs onboarding first)
  - systemctl daemon-reload
  - systemctl enable clawdbot.service

  # Harden SSH and enable fail2ban
  - systemctl restart sshd
  - systemctl enable fail2ban
  - systemctl start fail2ban

  # Signal completion
  - echo "Cloud-init completed at $(date)" >> /var/log/cloud-init-complete.log

final_message: "Oracle VPS setup complete after $UPTIME seconds"
`;
}
