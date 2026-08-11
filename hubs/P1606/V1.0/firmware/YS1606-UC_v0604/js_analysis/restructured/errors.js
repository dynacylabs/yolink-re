// Original webpack module: 46184
// Renamed from: class o extends Error { ... }  t.InterfaceError = o
//
// Central error type used across the whole app. Every API/RPC failure path
// constructs one of these from a short numeric/string "error code" and looks
// up a human-readable message from the table below.

const ERROR_MESSAGES_BY_CODE = {
  999999: "UnKnown error, please report it to yaochi@yosmart.com",
  999998: "Ingore", // [sic] - typo present in the original shipped code
  "000101": "Can't connect to Hub",
  "000102": "The hub cannot respond to this command",
  "000103": "Token is invalid",
  "000104": "Hub token is invalid",
  "000105": "redirect_uri can't be null",
  "000106": "client_id is invalid",
  "000201": "Cannot connect to the device",
  "000202": "The device cannot respond to this command",
  "000203": "Cannot connect to the device",
  "010000": "Service is not available, try again later",
  "010001": "Internal connection is not available, try again later",
  "010101": "Invalid request: CSID is invalid!",
  "010102": "Invalid request: SecKey is invalid!",
  "010103": "Invalid request: Authorization is invalid!",
  "010104": "Invalid request: The token is expired",
  "010105": "Invalid request: This interface is not support MQTT",
  "010201": "Invalid data packet: time can not be null",
  "010202": "Invalid data packet: method can not be null",
  "010203": "Invalid data packet: method is not supported",
  "010200": "Invalid data packet: params is not valid",
  "010204": "Invalid data packet",
  "010300": "This interface is restricted to access",
  "010301": "Access denied due to limits reached, Please retry later.",
  "020100": "The device is already bound by another user",
  "020101": "The device does not exist",
  "020102": "Device mask is invalid",
  "020103": "The device is not supported",
  "020104": "Device is busy, try again later.",
  "020105": "Unable to retrieve device",
  "020201": "No devices were searched",
  "030101": "No data found",
  813501: "No Data found",
  814501: "Invalid request",
};

class InterfaceError extends Error {
  code;

  constructor(code = "999999", message) {
    const resolvedCode = ERROR_MESSAGES_BY_CODE[code] ? code : "999999";
    // Code 814501 is the one case where the caller's own message is
    // preferred over the table's generic "Invalid request" text.
    super(
      (resolvedCode === "814501" ? message : undefined) ||
        ERROR_MESSAGES_BY_CODE[resolvedCode] ||
        message ||
        code
    );
    this.code = resolvedCode;
    Object.setPrototypeOf(this, InterfaceError.prototype);
  }

  toString() {
    return "YoSmart Interface Error[" + this.code + "]:" + this.message;
  }

  log() {
    logger.error(this.toString());
  }

  // Maps a small subset of codes onto HTTP status codes for the Express
  // layer; three-digit codes are assumed to already *be* an HTTP status.
  httpStatusCode() {
    if (/^\d{3}$/.test(this.code)) return parseInt(this.code);
    if (this.code === "010101" || this.code === "010102" || this.code === "010103") return 401;
    return undefined;
  }

  static fromError(err) {
    if (err instanceof InterfaceError) return err;
    const wrapped = new InterfaceError(err ? err.message : undefined);
    wrapped.stack = err.stack;
    return wrapped;
  }
}

module.exports = { InterfaceError, ERROR_MESSAGES_BY_CODE };
