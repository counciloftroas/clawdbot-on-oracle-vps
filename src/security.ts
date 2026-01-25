import * as oci from "@pulumi/oci";
import * as pulumi from "@pulumi/pulumi";

export interface SecurityListArgs {
    compartmentId: string;
    vcnId: pulumi.Input<string>;
    name: string;
    provider?: oci.Provider;
}

export function createSecurityList(args: SecurityListArgs): oci.core.SecurityList {
    return new oci.core.SecurityList(args.name, {
        compartmentId: args.compartmentId,
        vcnId: args.vcnId,
        displayName: args.name,

        // Egress: Allow all outbound traffic
        egressSecurityRules: [
            {
                destination: "0.0.0.0/0",
                protocol: "all",
                description: "Allow all outbound traffic",
            },
        ],

        // Ingress rules
        ingressSecurityRules: [
            // SSH access (requires public key authentication)
            {
                source: "0.0.0.0/0",
                protocol: "6", // TCP
                description: "Allow SSH",
                tcpOptions: {
                    min: 22,
                    max: 22,
                },
            },
            // Tailscale WireGuard (for direct P2P connections)
            {
                source: "0.0.0.0/0",
                protocol: "17", // UDP
                description: "Allow Tailscale",
                udpOptions: {
                    min: 41641,
                    max: 41641,
                },
            },
        ],
    }, { provider: args.provider });
}
