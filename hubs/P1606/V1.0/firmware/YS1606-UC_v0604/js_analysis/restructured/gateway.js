// Original webpack module: 57853
//
// Wraps the LoraClient (lora-transport.js) plus the "operational" side of
// being a LoRa gateway: reporting key/button events, connecting the local
// AP/network state to the wider hub-management flow, and bridging to
// remote/cloud MQTT. Most of the actual work is delegated to three
// modules not yet transcribed in this pass (56359, 36248, 65446) - see
// README.

const { getLogger } = require("./logger");
const { bindGatewayLora } = require("./gateway-lora-binding"); // original module 36248, not yet transcribed - see README
const { bindGatewayKeyEvent, getGatewayLocalState, gatewayStopApMode } = require("./gateway-key-events"); // original module 56359, not yet transcribed - see README
const { connectMqttClient, connectToSubNet, publishSubnetRemoteMessage, isRemoteMqttConnected } = require("./gateway-mqtt-bridge"); // original module 65446, not yet transcribed - see README

class Gateway {
  gwId;
  gwSecret;
  loraClient;
  gwConfig;
  logger = getLogger("gateway");

  constructor(loraClient, gwConfig, gwSecret) {
    this.loraClient = loraClient;
    this.gwConfig = gwConfig;
    this.gwId = gwConfig.deviceId;
    this.gwSecret = gwSecret;
    this.#init();
  }

  #init() {
    bindGatewayLora(this);
    bindGatewayKeyEvent(this);
    connectMqttClient(this);
  }

  // Called once the ChirpStack subnet (chirpstack-subnet.js) has finished
  // presetting itself - see task-registrations/start-loraserver-subnet.js.
  attachSubnet() {
    connectToSubNet(this);
  }

  publishSubnetRemoteMessage(topic, payload) {
    publishSubnetRemoteMessage(this, topic, payload);
  }

  isRemoteMqttConnected() {
    return isRemoteMqttConnected();
  }

  isInApOperator() {
    const state = getGatewayLocalState();
    return state.operationHelpers.indexOf("ap") > -1 || state.apEnabled;
  }

  getGwGeneralInfo() {
    return this.loraClient.getGeneralState();
  }

  stopApMode() {
    gatewayStopApMode();
  }
}

module.exports = { Gateway };
