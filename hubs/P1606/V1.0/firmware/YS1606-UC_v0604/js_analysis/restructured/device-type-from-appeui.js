// Original webpack module: 96324
//
// *** This is YoLink's own model-number decoder ring. ***
// AppEUIs are "d88b4c" + a 4-hex-digit model key + more bytes (see
// codec-factory.js/lora-packet-codec.js for the surrounding layout). This
// function turns that 4-hex-digit model key into the human-readable
// device-class string used everywhere else in the app (the same set of
// strings message-dispatcher.js's translateNSType maps to display names).
//
// The first two hex digits line up directly with product-number prefixes
// documented elsewhere in this repo:
//   "77" -> doorSensor    (matches P0706/YS7704 - see sensors/YS7704)
//   "80" -> THSensor      (matches the YS8003/8004/8005/8006 family - see sensors/YS8003)
//   "71" -> siren/PFSensor
//   "40"/"41" -> thermostat/sprinkler
// The rest weren't independently cross-referenced against this repo's own
// hardware inventory in this pass, but are included verbatim since they're
// a genuinely complete map of YoLink's product line as of this firmware
// build - worth a full pass if the sensor-side analysis (task #19)
// revisits device identification.

function deviceNsTypeFromModelKey(modelKey) {
  const familyPrefix = modelKey.substring(0, 2);
  const variant = modelKey.substring(2, 4);

  if (familyPrefix === "66" || familyPrefix === "67") return "outlet";

  if (familyPrefix === "77") {
    if (["04", "05", "06", "07"].includes(variant)) return "doorSensor";
    return undefined;
  }

  if (familyPrefix === "76") return ["16", "17", "18"].includes(variant) ? "MFLock" : "lock";

  if (familyPrefix === "57") {
    if (variant === "07") return "Dimmer";
    if (variant === "16") return "outlet";
    return "switch";
  }

  if (familyPrefix === "49") {
    if (variant === "06") return "garageDoor";
    if (variant === "07") return "manipulator";
    if (variant === "08") return "finger";
    if (variant === "09") return "manipulator";
    return undefined;
  }

  if (familyPrefix === "50") {
    if (["01", "02", "03", "12"].includes(variant)) return "manipulator";
    if (variant === "05") return "WaterLeakController";
    if (["06", "07", "08", "18", "09"].includes(variant)) return "WaterMeterController";
    if (variant === "29") return "WaterMeterMultiController";
    return undefined;
  }

  if (familyPrefix === "68") return variant === "03" ? "outlet" : "multiOutlet";
  if (familyPrefix === "78") return "bodySensor";
  if (familyPrefix === "79") return variant === "05" ? "WaterDepthSensor" : "leakSensor";

  if (familyPrefix === "48") {
    if (variant === "03") return "infraredRemoter"; // the YoLink Smart IR Remote, see chips/YL09 and the writeup's §1
    return undefined;
  }

  if (familyPrefix === "80") {
    if (["03", "04", "05", "06", "07", "08", "17", "14", "15"].includes(variant)) return "THSensor";
    return undefined;
  }

  if (familyPrefix === "41") return "sprinkler";
  if (familyPrefix === "40") return "thermostat";

  if (familyPrefix === "c1") {
    if (variant === "20") return "pm25";
    if (variant === "21" || variant === "22") return "TMTHSensor";
    return undefined;
  }

  if (familyPrefix === "71") {
    if (["03", "04", "05", "07"].includes(variant)) return "siren";
    if (variant === "06") return "PFSensor"; // power-failure alarm
    return undefined;
  }

  if (familyPrefix === "7a") return variant === "03" ? "VapeSoundDetector" : "GasSmokeSensor";
  if (familyPrefix === "36") return "SmartRemoter";
  if (["00", "01", "F0"].includes(familyPrefix)) return "CSDevice"; // meaning not confirmed in this pass
  if (familyPrefix === "72" && variant === "01") return "vibrationSensor";

  return undefined;
}

function deviceNsTypeFromAppEUI(appEUI) {
  return deviceNsTypeFromModelKey(appEUI.substring(6, 10));
}

module.exports = { deviceNsTypeFromModelKey, deviceNsTypeFromAppEUI };
