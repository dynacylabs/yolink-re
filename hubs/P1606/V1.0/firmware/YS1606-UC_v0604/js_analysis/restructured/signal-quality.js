// Original webpack module: 23712
// Converts nmcli's 0-100 wifi "SIGNAL" quality percentage to an
// approximate dBm value (linear mapping: 0 -> -100dBm, 100 -> -50dBm).
function signalQualityToDbm(signal) {
  if (typeof signal === "string") signal = parseInt(signal);
  return signal / 2 - 100;
}

module.exports = { signalQualityToDbm };
