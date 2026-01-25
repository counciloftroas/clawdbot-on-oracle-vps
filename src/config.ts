import * as dotenv from "dotenv";
// Load environment variables BEFORE importing Pulumi OCI provider
dotenv.config();

import * as fs from "fs";
import * as pulumi from "@pulumi/pulumi";
import * as oci from "@pulumi/oci";

// Oracle Cloud Always Free Tier Limits (Ampere A1)
// See: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
export const FREE_TIER_LIMITS = {
  maxOcpus: 4,
  maxMemoryInGbs: 24,
  maxBootVolumeInGbs: 200, // Combined boot + block storage limit
  maxEgressTbPerMonth: 10,
  shape: "VM.Standard.A1.Flex",
} as const;

const config = new pulumi.Config();
const ociConfig = new pulumi.Config("oci");

const _compartmentId = process.env.OCI_COMPARTMENT_ID;
if (!_compartmentId) {
  throw new Error("OCI_COMPARTMENT_ID environment variable is required");
}
export const compartmentId: string = _compartmentId;

const _region = process.env.OCI_REGION;
if (!_region) {
  throw new Error("OCI_REGION environment variable is required");
}
export const region: string = _region;

// Create explicit OCI provider with environment variables
const privateKeyPath = process.env.OCI_PRIVATE_KEY_FILE;
const privateKey = privateKeyPath && fs.existsSync(privateKeyPath)
  ? fs.readFileSync(privateKeyPath, "utf8")
  : undefined;

export const ociProvider = new oci.Provider("oci-provider", {
  region: _region,
  tenancyOcid: process.env.OCI_TENANCY_OCID,
  userOcid: process.env.OCI_USER_OCID,
  fingerprint: process.env.OCI_FINGERPRINT,
  privateKey: privateKey,
});

export const instanceName = config.get("instanceName") || "oracle-vps";
export const ocpus = config.getNumber("ocpus") || FREE_TIER_LIMITS.maxOcpus;
export const memoryInGbs =
  config.getNumber("memoryInGbs") || FREE_TIER_LIMITS.maxMemoryInGbs;
export const bootVolumeSizeInGbs =
  config.getNumber("bootVolumeSizeInGbs") || 100;

export function validateFreeTierCompliance(): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (ocpus > FREE_TIER_LIMITS.maxOcpus) {
    warnings.push(
      `OCPUs (${ocpus}) exceeds Always Free limit (${FREE_TIER_LIMITS.maxOcpus})`,
    );
  }
  if (memoryInGbs > FREE_TIER_LIMITS.maxMemoryInGbs) {
    warnings.push(
      `Memory (${memoryInGbs} GB) exceeds Always Free limit (${FREE_TIER_LIMITS.maxMemoryInGbs} GB)`,
    );
  }
  if (bootVolumeSizeInGbs > FREE_TIER_LIMITS.maxBootVolumeInGbs) {
    warnings.push(
      `Boot volume (${bootVolumeSizeInGbs} GB) exceeds Always Free limit (${FREE_TIER_LIMITS.maxBootVolumeInGbs} GB)`,
    );
  }

  return { valid: warnings.length === 0, warnings };
}

const compliance = validateFreeTierCompliance();
if (!compliance.valid) {
  compliance.warnings.forEach((w) =>
    pulumi.log.warn(`Free Tier Warning: ${w}`),
  );
}

export const vcnCidrBlock = config.get("vcnCidrBlock") || "10.0.0.0/16";
export const subnetCidrBlock = config.get("subnetCidrBlock") || "10.0.0.0/24";

// SSH Public Key (from environment variable) - REQUIRED
const _sshPublicKey = process.env.SSH_PUBLIC_KEY;
if (!_sshPublicKey) {
  throw new Error(
    "SSH_PUBLIC_KEY environment variable is required. Cannot deploy without SSH access configured.",
  );
}
export const sshPublicKey: string = _sshPublicKey;

// Tailscale Configuration (from environment variables)
export const tailscaleOAuthClientId = process.env.TAILSCALE_CLIENT_ID;
export const tailscaleOAuthClientSecret = process.env.TAILSCALE_CLIENT_SECRET;
export const tailscaleHostname = process.env.TAILSCALE_HOSTNAME || instanceName;
export const tailscaleTailnet = process.env.TAILSCALE_TAILNET;
export const tailscaleTag = process.env.TAILSCALE_TAG || "server";

// Availability domain index (0-based, for cycling through ADs)
export const availabilityDomainIndex =
  config.getNumber("availabilityDomainIndex") || 0;

// Get the availability domain for the compartment
export async function getAvailabilityDomain(): Promise<string> {
  const ads = await oci.identity.getAvailabilityDomains({
    compartmentId: compartmentId,
  }, { provider: ociProvider });

  if (ads.availabilityDomains.length === 0) {
    throw new Error("No availability domains found");
  }

  // Use the specified AD index, wrapping around if out of bounds
  const index = availabilityDomainIndex % ads.availabilityDomains.length;
  pulumi.log.info(
    `Using availability domain ${index + 1} of ${ads.availabilityDomains.length}: ${ads.availabilityDomains[index].name}`,
  );
  return ads.availabilityDomains[index].name;
}

// Get Ubuntu 22.04 ARM image for the region
export async function getUbuntuImage(): Promise<string> {
  const images = await oci.core.getImages({
    compartmentId: compartmentId,
    operatingSystem: "Canonical Ubuntu",
    operatingSystemVersion: "22.04",
    shape: "VM.Standard.A1.Flex",
    sortBy: "TIMECREATED",
    sortOrder: "DESC",
  }, { provider: ociProvider });

  if (images.images.length === 0) {
    throw new Error("No Ubuntu 22.04 ARM images found");
  }

  return images.images[0].id;
}
