// Original webpack module: 76630
// The RPC-over-MQTT client (mqtt-rpc.js's RpcClientOverMQTT) matter-app.js
// uses to talk to the separate Matter integration child process, over
// the local broker's "/lcsubnet/matter_rpc" channel.
const { RpcClientOverMQTT } = require("./mqtt-rpc");

class MatterRPCClient extends RpcClientOverMQTT {
  constructor() {
    super("/lcsubnet/matter_rpc");
  }

  getGeneralInfo(params) {
    return this.sendCommand({ method: "getGeneralInfo", params }).then((result) => result.data);
  }
}

module.exports = { MatterRPCClient };
