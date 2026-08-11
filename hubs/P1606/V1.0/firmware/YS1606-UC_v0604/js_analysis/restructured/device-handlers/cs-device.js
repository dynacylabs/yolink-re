// Original webpack module: 94837 (CSDevice)
//
// FINDING: this module was previously flagged as a mystery ("only 2
// methods, doesn't match any device type") based on an earlier,
// incomplete read - having now examined the full raw module, it's
// clearly a generic raw-command/passthrough device handler, not a real
// sensor codec. Unlike every other device handler in this bundle (see
// device-command-tables.md), it does NOT decode any structured fields -
// it just wraps the entire remaining payload as opaque bytes.
//
// _anasysFromPacket() classifies an inbound frame as a structured
// "Report" in either of two cases: byte 0 has its top 2 bits set
// (>= 0x40), regardless of byte 1; OR byte 0 is exactly 0 AND byte 1 is
// one of {129, 40, 131} (the universal StatusChange/Alert/Report opcodes
// every other device type uses - see device-command-tables.md's
// "Patterns worth noting"). Either way, no actual field parsing happens
// - the whole buffer is just stashed as `data.payload`. Everything else
// is treated as an arbitrary "sendCommand" echo - same opaque-payload
// wrapping, different method label.
// Downlink direction is symmetric: genDownlink() just writes back
// whatever raw byte array the caller supplied as `params.payload`,
// for either a "sendCommand" or "downlink" outbound method.
//
// What "CS" stands for wasn't determined in this pass. Given the total
// absence of any structured decode/encode and the generic
// "sendCommand"/raw-payload shape, the most likely explanation is a
// catch-all/passthrough handler for private-label or OEM devices that
// don't have their own dedicated YoLink codec - not a real consumer
// product documented elsewhere in this repo.

const { DataPacket } = require("../data-packet");

function bufferToArray(buffer) {
  if (buffer == null) return;
  let arr = [];
  buffer.forEach((byte) => {
    arr.push(byte);
  });
  return arr;
}

class CSDevice extends DataPacket {
  anasysLoraInfo(result) { // [sic] "anasys" - throughout this class, likely short for "analysis"
    if (this.loraInfo) {
      result.data = result.data || {};
      result.data.loraInfo = this.loraInfo;
      result.data.loraPacketInfo = this.loraPacketInfo;
    }
  }

  anasysReport(result, packet) {
    result.method = "Report";
    result.data = result.data || {};
    result.data.payload = bufferToArray(packet.buffer);
    this.anasysLoraInfo(result);
  }

  anasysTXRX(result, packet) {
    result.method = "sendCommand";
    result.data = result.data || {};
    result.data.payload = bufferToArray(packet.buffer);
    this.anasysLoraInfo(result);
  }

  _anasysFromPacket() {
    var result = { type: "CSDevice", data: {} };
    // True unless byte 0 is exactly 0 AND byte 1 is one of the universal
    // StatusChange/Alert/Report opcodes (129/40/131) - i.e. "doesn't look
    // like a standard envelope" -> treat as a raw command echo instead.
    const isRawCommandFrame =
      (192 & this.buffer[0]) >>> 6 == 0 &&
      (this.buffer[0] != 0 || (this.buffer[1] != 129 && this.buffer[1] != 40 && this.buffer[1] != 131));
    if (isRawCommandFrame) this.anasysTXRX(result, this);
    else this.anasysReport(result, this);
    return result;
  }

  genDownlink(request) {
    if (request?.params?.payload) return Buffer.from(request.params.payload);
  }

  _generateFromBRDP(request) {
    if (request && request.method) {
      var action = request.method.split(".")[1];
      return action == "sendCommand" || action == "downlink" ? this.genDownlink(request) : undefined;
    }
  }

  _getDeviceState(state) {}
}

module.exports = { CSDevice };
