// Original webpack module: 36248
//
// THE core LoRa uplink dispatch point: every raw uplink frame from the
// radio module (lora-transport.js's LoraClient) passes through here
// first. Classifies the frame (JoinRequest vs Data-up, via
// lora-uplink-metadata.js), decides LAN vs WAN routing, and forwards the
// re-encoded protobuf (gateway-proto-codec.js's parseJSON2Proto) to
// either the LOCAL MQTT broker (this hub's own embedded ChirpStack
// instance, mqtt-local-broker.js) or the REMOTE/cloud MQTT broker
// (mqtt-remote-broker.js).
//
// Routing rule: a JoinRequest is "LAN" if its DevEUI matches a device
// already known to this hub's own subnet (app.getSubnet().isLocalDevice) -
// i.e. it's a device this hub itself provisioned. A data uplink is "LAN"
// if its DevAddr falls in the LoRaWAN-Alliance "locally administered"
// NetID range (see lora-net-id.js's isLan()/LoraNetId type 6-7) - this is
// the actual mechanism behind "P1606 can bridge older YoLink hubs into
// itself" (see yolink-hub.js's P1605-bridge regex): a bridged legacy hub
// broadcasts with a LAN-range DevAddr, so its traffic gets kept local and
// handed to this hub's own embedded ChirpStack via the local broker,
// rather than forwarded to the cloud.
//
// Downlink direction: subscribes to this gateway's own "tx" topic on the
// local broker and hands anything received there to
// onProtoLoraDownlinkMessage (lora-downlink-handler.js, module 35003) -
// the same handler mqtt-remote-broker.js calls for cloud-originated
// downlinks.

const { getMetadataFromLoraUplink } = require("./lora-uplink-metadata");
const { parseJSON2Proto } = require("./gateway-proto-codec");
const { publishLocalMessage, MqttSubscriber } = require("./mqtt-local-broker");
const { publishRemoteMessage } = require("./mqtt-remote-broker");
const { onProtoLoraDownlinkMessage } = require("./lora-downlink-handler");

function handleUplink(gateway, uplink) {
  var phyPayload = Buffer.from(uplink.phyPayload, "base64");
  var meta = getMetadataFromLoraUplink(phyPayload);

  if (meta?.type == "JoinRequest") {
    var isLan = app.getSubnet()?.isLocalDevice(meta.devEUI.toString("hex").toLowerCase()) == 1;
    gateway.logger.debug(`Join Request[${isLan ? "LAN" : "WAN"}]\t${uplink.rxInfo.rssi}: ${meta.devEUI.toString("hex")} ${meta.appEUI.toString("hex")}`);
    if (isLan) {
      publishLocalMessage(`${gateway.gwConfig.svr.mqtt.tpkfix}/${gateway.gwId}/rx`, parseJSON2Proto(uplink, gateway.gwId), (err) => {
        if (err) gateway.logger.error("send lora packet to server failed", err);
        else gateway.logger.debug("send lora packet to server success");
      });
    } else {
      publishRemoteMessage(gateway, "rx", parseJSON2Proto(uplink, gateway.gwId));
    }
  } else if (meta?.type == "UnconfirmedDataUp" || meta?.type == "ConfirmedDataUp") {
    var isLan = meta.devAddr.isLan();
    gateway.logger.debug(`${meta?.type}[${isLan ? "LAN" : "WAN"}]\t${meta.devAddr.buf.toString("hex")}\t${uplink.rxInfo.rssi}: ${phyPayload.toString("hex")}`);
    if (isLan) {
      publishLocalMessage(`${gateway.gwConfig.svr.mqtt.tpkfix}/${gateway.gwId}/rx`, parseJSON2Proto(uplink, gateway.gwId), (err) => {
        gateway.logger.error("send lora packet to server " + (err ? "failed" : "success"), err);
      });
    } else {
      publishRemoteMessage(gateway, "rx", parseJSON2Proto(uplink, gateway.gwId));
    }
  } else {
    gateway.logger.debug(`${meta?.type}\t${uplink.rxInfo.rssi}: ${phyPayload.toString("hex")}`);
  }
}

function bindGatewayLora(gateway) {
  gateway.loraClient.setOnLoraMessage((uplink) => {
    handleUplink(gateway, uplink);
  });

  new MqttSubscriber(`${gateway.gwConfig.svr.mqtt.tpkfix}/${gateway.gwId}/tx`, (topic, payload) => {
    onProtoLoraDownlinkMessage(payload, gateway);
  }).start();
}

module.exports = { bindGatewayLora };
