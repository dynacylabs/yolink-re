// Original webpack module: 48409
// Thin framing layer on top of a raw byte-pipe (LinuxSocketPipe, see
// lora-transport.js): messages are null-byte (0x00) delimited UTF-8
// strings. MessagePipe itself is an empty marker base class.

class MessagePipe {}

class MessageQueueClient {
  pipe;

  constructor(pipe) {
    this.pipe = pipe;
    this.pipe.bindOnMessageEvent(this.#onBufferMessage.bind(this));
  }

  sendMessage(str) {
    if (this.pipe.isRunning() === true) this.pipe.sendMessage(str);
    else console.error("MessagePipe is not running");
  }

  #onBufferMessage(buffer) {
    const nullByteIndex = buffer.indexOf(0);
    this.onMessage(buffer.toString("utf-8", 0, nullByteIndex));
  }

  // Subclasses (LoraClient in lora-transport.js) override this.
  onMessage(_str) {}
}

module.exports = { MessagePipe, MessageQueueClient };
