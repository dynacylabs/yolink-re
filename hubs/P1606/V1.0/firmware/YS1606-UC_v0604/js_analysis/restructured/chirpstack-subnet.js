// Original webpack module: 5822 (YLSubnet)
//
// *** This is the file that proves the ChirpStack integration. ***
// YLSubnet programmatically provisions a ChirpStack tenant, one
// DeviceProfile per LoRaWAN device class (A/C/D), and one Application per
// AppEUI, then syncs individual devices in and out of ChirpStack to match
// whatever this hub's own subnet-membership list says should exist. All
// of `createTenant`/`createApplication`/`createDeviceProfile`/
// `createDevice`/`createDeviceKeys`/`listDevices` etc. (imported from
// "./chirpstack-grpc-client", original module 70135, not yet transcribed
// - see README) are calls into ChirpStack's own gRPC API using the
// generated client stubs bundled elsewhere in this JS file (the large
// `proto.api.*` modules identified during triage - see README).
//
// In other words: this Node process isn't just "using something a bit
// like ChirpStack" - it's actively managing a real ChirpStack server's
// tenant/application/device-profile/device state as its source of truth
// for what LoRaWAN devices exist.

const { DeviceProfile, CreateDeviceProfileRequest, Device, CreateDeviceRequest } = require("./chirpstack-proto"); // original modules 88747 / 94444 (jspb-generated), not transcribed
const { Region, MacVersion, RegParamsRevision } = require("./chirpstack-proto-enums"); // original module 20545
const chirpstack = require("./chirpstack-grpc-client"); // original module 70135
const { LoraServerPipe } = require("./loraserver-pipe"); // original module 10838, not yet transcribed - see README
const { YLSubnetDevicesRepository } = require("./yl-subnet-devices-repository"); // original module 65016

const DEVICE_CLASSES = ["A", "C", "D"];

// Ensures a ChirpStack DeviceProfile exists for (loraServiceProfile,
// deviceClass) - e.g. "US915LC_A" - creating it with YoLink's standard
// settings if it's missing. Only known to build real profiles for the
// "US915LC" service profile; other regions fall through without creating
// anything (possibly unfinished, possibly intentionally out of scope for
// this firmware build - not confirmed).
async function ensureDeviceProfile(existingProfiles, subnet, deviceClass) {
  const profileName = `${subnet.subNet.loraServiceProfile}_${deviceClass}`;
  const existing = existingProfiles.find((p) => p.getName() === profileName);
  if (existing != null) {
    subnet.deviceProfiles[deviceClass] = { id: existing.getId() };
    return;
  }
  if (subnet.subNet.loraServiceProfile !== "US915LC") return;

  const profile = new DeviceProfile();
  profile.setName(profileName);
  profile.setDescription("Auto created");
  profile.setRegion(Region.US915LC);
  profile.setRegionConfigId("us915lc");
  profile.setMacVersion(MacVersion.LORAWAN_1_1_0);
  profile.setRegParamsRevision(RegParamsRevision.B);
  profile.setAdrAlgorithmId("default");
  profile.setFlushQueueOnActivate(true);
  profile.setAllowRoaming(false);
  profile.setUplinkInterval(18000);
  profile.setDeviceStatusReqInterval(0);
  profile.setRx1Delay(0);
  profile.setSupportsOtaa(true);
  profile.setSupportsClassB(false);
  profile.setSupportsClassC(deviceClass === "C");
  if (profile.getSupportsClassC()) profile.setClassCTimeout(0);
  profile.setSupportsClassD(deviceClass === "D"); // note: "Class D" isn't a real LoRaWAN class - see README
  profile.setTenantId(subnet.getTenant().id);

  const request = new CreateDeviceProfileRequest();
  request.setDeviceProfile(profile);
  const created = await chirpstack.createDeviceProfile(request);
  subnet.deviceProfiles[deviceClass] = { id: created.getId() };
}

async function removeChirpStackDevice(_unused, devEui) {
  await chirpstack.deleteDevice(devEui);
}

async function ensureChirpStackApplication(subnet, appEui) {
  if (subnet.applications[appEui] == null) {
    const created = await chirpstack.createApplication(appEui, subnet.getTenant().id);
    subnet.applications[appEui] = { id: created.getId(), name: appEui };
  }
}

// Creates the ChirpStack Device (+ device keys, for OTAA join) for one
// locally-known device, skipping it entirely if this subnet doesn't have
// a device profile for its class yet.
async function ensureChirpStackDevice(subnet, localDevice) {
  if (subnet.deviceProfiles[localDevice.devClassType] == null) return;
  await ensureChirpStackApplication(subnet, localDevice.appEui);
  if (subnet.applications[localDevice.appEui] == null) return;

  const device = new Device();
  device.setDevEui(localDevice.id);
  device.setJoinEui(localDevice.appEui);
  device.setName(localDevice.id);
  device.setApplicationId(subnet.applications[localDevice.appEui].id);
  device.setDeviceProfileId(subnet.deviceProfiles[localDevice.devClassType].id);
  device.setIsDisabled(false);
  device.setSkipFcntCheck(true);

  const request = new CreateDeviceRequest();
  request.setDevice(device);
  await chirpstack.createDevice(request);
  await chirpstack.createDeviceKeys(localDevice.id, localDevice.devSecret);
}

class YLSubnet {
  subNet;
  deviceProfiles = { A: undefined, C: undefined, D: undefined };
  applications = {};
  tenant;
  devices = [];
  pipe;

  constructor(subnetConfig) {
    this.subNet = subnetConfig;
    this.pipe = new LoraServerPipe();
  }

  getSubnetId() { return this.subNet.id; }
  getLoraNetId() { return this.subNet.loraNetId; }
  getSubnet() { return this.subNet; }

  getTenant() {
    if (this.tenant == null) throw new Error("Tenant is not preset"); // [sic] "preset" - typo for "present"/"preset" used consistently
    return this.tenant;
  }

  // Ensures a ChirpStack Tenant exists matching this subnet's name
  // (renaming it if ChirpStack's copy has drifted), then syncs device
  // profiles/applications/devices to match.
  async preset() {
    this.tenant = await (async () => {
      const existingTenants = await chirpstack.listTenant();
      if (existingTenants.getResultList().length === 0) {
        return { id: (await chirpstack.createTenant(this.subNet.name)).getId(), name: this.subNet.name };
      }
      const tenant = existingTenants.getResultList()[0];
      if (tenant.getName() !== this.subNet.name) {
        tenant.setName(this.subNet.name);
        await chirpstack.updateTenant(tenant);
      }
      return { id: tenant.getId(), name: tenant.getName() };
    })();
    if (this.tenant == null) throw new Error("Tenant is not preset");
    await this.syncData();
  }

  async syncData() {
    // 1. Device profiles (one per device class this subnet uses).
    const existingProfiles = (await chirpstack.listDeviceProfiles(this.getTenant().id)).getResultList();
    for (const deviceClass of DEVICE_CLASSES) await ensureDeviceProfile(existingProfiles, this, deviceClass);

    // 2. Applications (one per AppEUI already known to ChirpStack).
    (await chirpstack.listApplications(this.getTenant().id)).getResultList().forEach((application) => {
      this.applications[application.getName()] = { id: application.getId(), name: application.getName() };
    });

    // 3. Devices: diff this subnet's locally-known device list against
    //    what ChirpStack currently has, and create/remove to match.
    const localDevices = await YLSubnetDevicesRepository.of().getData();
    if (localDevices != null && localDevices.length !== 0) {
      this.devices = localDevices;

      const chirpstackDevices = [];
      for (const appEui in this.applications) {
        const page = await chirpstack.listDevices(this.applications[appEui].id);
        chirpstackDevices.push(...page.getResultList());
      }

      const missingFromChirpStack = localDevices.filter(
        (local) => chirpstackDevices.find((remote) => remote.getDevEui() === local.id) == null
      );
      const staleInChirpStack = chirpstackDevices.filter(
        (remote) => localDevices.find((local) => local.id === remote.getDevEui()) == null
      );

      console.log(`New devices: ${missingFromChirpStack.length}`);
      for (const localDevice of missingFromChirpStack) await ensureChirpStackDevice(this, localDevice);

      console.log(`Remove devices: ${staleInChirpStack.length}`);
      for (const remoteDevice of staleInChirpStack) await removeChirpStackDevice(0, remoteDevice.getDevEui());
    }
  }

  async start() {
    this.pipe.start();
  }

  isLocalDevice(deviceId) {
    return this.devices.find((d) => d.id === deviceId) != null;
  }

  sendLoraTxMessage(deviceId, payload, options) {
    return this.pipe.sendLoraTxMessage(deviceId, payload, {
      confirmed: options.confirmed ?? true,
      fPort: options.fPort ?? 1,
    });
  }
}

module.exports = { YLSubnet };
