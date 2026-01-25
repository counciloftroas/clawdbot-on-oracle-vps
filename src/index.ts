import * as pulumi from "@pulumi/pulumi";
import * as oci from "@pulumi/oci";
import * as config from "./config";
import { createSecurityList } from "./security";
import { createComputeInstance } from "./compute";
import { generateCloudInit } from "./cloud-init";

const vcn = new oci.core.Vcn("oracle-vps-vcn", {
  compartmentId: config.compartmentId,
  cidrBlocks: [config.vcnCidrBlock],
  displayName: "oracle-vps-vcn",
  dnsLabel: "oraclevps",
}, { provider: config.ociProvider });

const internetGateway = new oci.core.InternetGateway("oracle-vps-igw", {
  compartmentId: config.compartmentId,
  vcnId: vcn.id,
  displayName: "oracle-vps-igw",
  enabled: true,
}, { provider: config.ociProvider });

const routeTable = new oci.core.RouteTable("oracle-vps-rt", {
  compartmentId: config.compartmentId,
  vcnId: vcn.id,
  displayName: "oracle-vps-rt",
  routeRules: [
    {
      destination: "0.0.0.0/0",
      destinationType: "CIDR_BLOCK",
      networkEntityId: internetGateway.id,
    },
  ],
}, { provider: config.ociProvider });

const securityList = createSecurityList({
  compartmentId: config.compartmentId,
  vcnId: vcn.id,
  name: "oracle-vps-sl",
  provider: config.ociProvider,
});

const subnet = new oci.core.Subnet("oracle-vps-subnet", {
  compartmentId: config.compartmentId,
  vcnId: vcn.id,
  cidrBlock: config.subnetCidrBlock,
  displayName: "oracle-vps-subnet",
  dnsLabel: "public",
  routeTableId: routeTable.id,
  securityListIds: [securityList.id],
  prohibitPublicIpOnVnic: false,
}, { provider: config.ociProvider });

const cloudInitUserData =
  config.tailscaleOAuthClientId && config.tailscaleOAuthClientSecret && config.tailscaleTailnet
    ? generateCloudInit({
        tailscaleOAuthClientId: config.tailscaleOAuthClientId,
        tailscaleOAuthClientSecret: config.tailscaleOAuthClientSecret,
        tailscaleTailnet: config.tailscaleTailnet,
        tailscaleHostname: config.tailscaleHostname,
        tailscaleTag: config.tailscaleTag,
      })
    : undefined;

const instance = pulumi
  .all([config.getAvailabilityDomain(), config.getUbuntuImage()])
  .apply(([availabilityDomain, imageId]) => {
    return createComputeInstance({
      compartmentId: config.compartmentId,
      availabilityDomain: availabilityDomain,
      subnetId: subnet.id,
      imageId: imageId,
      name: config.instanceName,
      ocpus: config.ocpus,
      memoryInGbs: config.memoryInGbs,
      bootVolumeSizeInGbs: config.bootVolumeSizeInGbs,
      sshPublicKey: config.sshPublicKey,
      cloudInitUserData: cloudInitUserData,
      provider: config.ociProvider,
    });
  });

export const vcnId = vcn.id;
export const subnetId = subnet.id;
export const instanceId = instance.id;
export const instancePublicIp = instance.publicIp;
export const instancePrivateIp = instance.privateIp;
export const tailscaleFqdn =
  config.tailscaleOAuthClientSecret && config.tailscaleTailnet
    ? `${config.tailscaleHostname}.${config.tailscaleTailnet}`
    : undefined;
