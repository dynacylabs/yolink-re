// Original webpack module: 65446
//
// The CLOUD-side MQTT connection - distinct from mqtt-local-broker.js
// (which is the embedded, in-process aedes broker for local/on-hub
// clients) and mqtt-rpc.js (RPC-over-MQTT, also local). This module dials
// OUT to YoSmart's remote MQTT broker using per-gateway credentials
// (gwId as username, a per-gateway password from gwConfig - NOT a
// hardcoded shared secret, unlike the local broker's AUTH_TABLE or
// general-client.js's "as" password), and is the transport that carries:
//   - admin commands from the cloud, dispatched into
//     hub-remote-commands.js's handleCommand()
//   - downlink LoRa messages from the cloud, handed to
//     onProtoLoraDownlinkMessage() (original module 35003, not yet
//     examined - likely the ChirpStack downlink-proto decode path)
//   - "lcsub" (local-control-subnet) tx messages for bridged legacy hubs
//     (see yolink-hub.js's P1605-bridge handling), routed to
//     subnet.sendLoraTxMessage()
//
// Topic shape: `${gwId}/${tpkfix}/{tx|admin}` for the hub's own topics,
// and `${gwId}/${loraNetId}/lcsub/{tx}` for per-subnet topics.

const mqtt = require("mqtt");
const { handleCommand } = require("./hub-remote-commands");
const { onProtoLoraDownlinkMessage } = require("./lora-downlink-handler"); // original module 35003, not yet transcribed

let mqttClient = undefined;
let pendingSubscriptions = new Set();

function topicPath(prefix, suffix, name) {
  return `${suffix}/${prefix}/${name}`;
}

// Gateway's own tx/admin topics: `${gwId}/${tpkfix}/{tx|admin}`.
function gatewayTopic(gateway, name) {
  return topicPath(gateway.gwId, gateway.gwConfig.svr.mqtt.tpkfix, name);
}

// Per-subnet "lcsub" topic: `${gwId}/${loraNetId}/lcsub/{tx}`.
function subnetTopic(gateway, loraNetId, name) {
  return topicPath(gateway.gwId + "/" + loraNetId, "lcsub", name);
}

function subscribe(topic, gateway) {
  mqttClient.subscribe(topic, function (err) {
    if (err) gateway.logger.error(`[Remote MQTT]Subscribed to ${topic} failed`, err);
    else gateway.logger.info(`[Remote MQTT]Subscribed to ${topic} successfully`);
  });
}

function publishRemoteMessage(gateway, name, payload) {
  mqttClient?.publish(gatewayTopic(gateway, name), payload);
}

function publishSubnetRemoteMessage(gateway, name, payload) {
  var loraNetId = app.getLoraNetId();
  if (loraNetId != null) {
    var topic = subnetTopic(gateway, loraNetId, name);
    gateway.logger.debug(`Pub to lcsub: ${topic}, message: ${payload}`);
    mqttClient?.publish(topic, payload);
  }
}

// Subscribes to a bridged legacy hub's ("lcsub") tx topic once this
// gateway's own subnet id is known - see yolink-hub.js's connectedHub
// handling.
async function connectToSubNet(gateway) {
  var loraNetId = app.getLoraNetId();
  if (loraNetId != null) {
    var topic = subnetTopic(gateway, loraNetId, "tx");
    pendingSubscriptions.add(topic);
    if (mqttClient?.connected == true) subscribe(topic, gateway);
  }
}

function connectMqttClient(gateway) {
  pendingSubscriptions.add(gatewayTopic(gateway, "tx"));
  pendingSubscriptions.add(gatewayTopic(gateway, "admin"));

  mqttClient = mqtt.connect(gateway.gwConfig.svr.mqtt.url, {
    username: gateway.gwId,
    password: gateway.gwConfig.svr.mqtt.pwd,
    clientId: `SG-${gateway.gwId}`,
    reconnectPeriod: 1000,
    resubscribe: true,
  });

  mqttClient.on("message", function (topic, payload) {
    var subnet = app.getSubnet();
    if (topic == gatewayTopic(gateway, "admin")) {
      handleCommand(payload.toString(), gateway).then((result) => {
        gateway.logger.debug(result);
        publishRemoteMessage(gateway, "adminReply", Buffer.from(result));
      });
    } else if (topic == gatewayTopic(gateway, "tx")) {
      onProtoLoraDownlinkMessage(payload, gateway);
    } else if (subnet != null && topic == subnetTopic(gateway, subnet.getLoraNetId(), "tx")) {
      let msg = JSON.parse(payload.toString());
      subnet.sendLoraTxMessage(msg.deviceId, Buffer.from(msg.data, "base64"), msg.options);
    } else {
      gateway.logger.debug(payload.toString());
    }
  });

  mqttClient.on("connect", function () {
    gateway.logger.info("Remote MQTT Connected");
    pendingSubscriptions.forEach((topic) => {
      subscribe(topic, gateway);
    });
  });

  mqttClient.on("error", function (err) {
    gateway.logger.error("Remote Mqtt Error", err);
  });

  mqttClient.on("close", function () {
    gateway.logger.error("Remote Mqtt Closed");
  });
}

function isRemoteMqttConnected() {
  return mqttClient?.connected == true;
}

module.exports = {
  connectMqttClient,
  publishRemoteMessage,
  publishSubnetRemoteMessage,
  connectToSubNet,
  isRemoteMqttConnected,
};
