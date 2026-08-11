// Original webpack module: 10838 (LoraServerPipe)
//
// The actual bridge between ChirpStack and this app's internal message
// bus. Subscribes to ChirpStack's own default uplink-event MQTT topic
// (`application/+/device/+/event/up` - confirmed ChirpStack convention,
// see js_analysis/README.md) and to a `/ys/+/tx` topic for outbound app
// commands, translates between ChirpStack's protobuf uplink format and
// YoLink's own JSON shape, and forwards into the message-dispatcher bus.

const { setupInternalDispatcher } = require("./internal-dispatcher-setup"); // original module 41073, not yet transcribed - see README
const { deviceEnqueue } = require("./chirpstack-grpc-client"); // original module 70135
const { publishLocalMessage, MqttSubscriber } = require("./mqtt-local-broker");
const { UplinkEvent } = require("./chirpstack-integration-proto"); // original module 80608 (jspb-generated) - not transcribed, vendor
const { parseLorawan2LegacyLoraJson, parseLorawan2YSStd } = require("./lorawan-event-translation"); // original module 58877, not yet transcribed - see README

class LoraServerPipe {
  #internalDispatcher;

  constructor() {
    this.#internalDispatcher = setupInternalDispatcher({
      sendMQTTMessage: (channel, payload) => {
        publishLocalMessage(channel, payload, () => {});
      },
    });
  }

  start() {
    new MqttSubscriber("application/+/device/+/event/up", this.onLoraRXEvent.bind(this)).start();
    new MqttSubscriber("/ys/+/tx", this.onAppCommand.bind(this)).start();
  }

  // ChirpStack delivers uplinks as a serialized protobuf `UplinkEvent` on
  // its MQTT topic. Translate that into YoLink's own two-stage JSON shape
  // (first "legacy Lora JSON" for the app-facing pipe, then that into the
  // "YS std" shape the rest of the app's message-dispatcher expects) and
  // fan out both to the internal bus and to the app-facing subnet-remote
  // channel.
  onLoraRXEvent(topic, payload) {
    const uplinkEvent = UplinkEvent.deserializeBinary(payload);
    const legacyJson = parseLorawan2LegacyLoraJson(uplinkEvent);
    const ysMessage = parseLorawan2YSStd(legacyJson);
    legacyJson.subnetId = app.getSubnetId();
    logger.info("Msg Received");
    if (ysMessage) {
      this.#internalDispatcher.sendMqttFromLorawanDevice({ deviceId: ysMessage.deviceId, channel: topic, payload: ysMessage });
      app.getGateway().publishSubnetRemoteMessage("rx", Buffer.from(JSON.stringify(legacyJson)));
    } else {
      logger.info(`Invalid rx ${payload.toString("hex")} at ${topic}`);
    }
  }

  onAppCommand(topic, payload) {
    const command = JSON.parse(payload.toString());
    const taggedMessage = { deviceId: topic.split("/")[2], channel: topic, payload: command };
    logger.info(taggedMessage, command.method || "action");
    this.#internalDispatcher.sendMqttToLoracanDevice(taggedMessage);
  }

  // Queues a downlink for delivery to ChirpStack (real transmission
  // happens on ChirpStack's own schedule/timing).
  sendLoraTxMessage(deviceId, payload, options) {
    return deviceEnqueue(deviceId, payload, options).then((queueItem) => ({ id: queueItem.getId() }));
  }
}

module.exports = { LoraServerPipe };
