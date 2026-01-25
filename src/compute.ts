import * as oci from "@pulumi/oci";
import * as pulumi from "@pulumi/pulumi";

export interface ComputeInstanceArgs {
  compartmentId: string;
  availabilityDomain: string;
  subnetId: pulumi.Input<string>;
  imageId: string;
  name: string;
  ocpus: number;
  memoryInGbs: number;
  bootVolumeSizeInGbs: number;
  sshPublicKey: string;
  cloudInitUserData?: pulumi.Input<string>;
  provider?: oci.Provider;
}

export function createComputeInstance(
  args: ComputeInstanceArgs,
): oci.core.Instance {
  const metadata: Record<string, pulumi.Input<string>> = {};

  metadata["ssh_authorized_keys"] = args.sshPublicKey;

  if (args.cloudInitUserData) {
    metadata["user_data"] = pulumi
      .output(args.cloudInitUserData)
      .apply((data) => Buffer.from(data).toString("base64"));
  }

  return new oci.core.Instance(
    args.name,
    {
      compartmentId: args.compartmentId,
      availabilityDomain: args.availabilityDomain,
      displayName: args.name,

      // Always Free Ampere A1 shape
      shape: "VM.Standard.A1.Flex",
      shapeConfig: {
        ocpus: args.ocpus,
        memoryInGbs: args.memoryInGbs,
      },

      sourceDetails: {
        sourceType: "image",
        sourceId: args.imageId,
        bootVolumeSizeInGbs: args.bootVolumeSizeInGbs.toString(),
      },

      createVnicDetails: {
        subnetId: args.subnetId,
        assignPublicIp: "true",
        displayName: `${args.name}-vnic`,
      },

      // Instance metadata (SSH keys)
      metadata: metadata,

      // Preserve boot volume on termination
      preserveBootVolume: false,
    },
    { protect: false, provider: args.provider },
  );
}
