import serial
import time
import logging
import string

# Configure logging
LOG_FILE = "serial_baud_rate_log.txt"
logging.basicConfig(filename=LOG_FILE, level=logging.INFO, format="%(asctime)s - %(message)s")

# List of standard baud rates to test
BAUD_RATES = [
    300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400, 57600,
    76800, 115200, 153600, 230400, 250000, 307200, 460800, 500000, 576000,
    921600, 1000000, 1152000, 1228800, 1500000, 1843200, 2000000, 2500000,
    3000000, 3500000, 4000000, 4500000, 5000000, 6000000, 7500000, 8000000,
    9000000, 10000000, 12000000
]


# Define the serial port (modify as needed)
SERIAL_PORT = "/dev/ttyUSB0"  # Change this for your setup (e.g., COM3 on Windows)
TIMEOUT = 10  # Seconds to wait for data at each baud rate

# Function to check if data is "intelligible"
def is_intelligible(data):
    """Checks if the data is mostly printable ASCII characters."""
    if not data:
        return False
    try:
        decoded = data.decode(errors='ignore')
        readable_chars = sum(c in string.printable for c in decoded)
        return readable_chars / len(decoded) > 0.8  # At least 80% should be printable
    except:
        return False

# Start testing baud rates
successful_baud_rates = []

logging.info("Starting serial baud rate detection on %s", SERIAL_PORT)

for baud in BAUD_RATES:
    try:
        with serial.Serial(SERIAL_PORT, baudrate=baud, timeout=TIMEOUT) as ser:
            logging.info("Testing baud rate: %d", baud)
            print(f"Trying baud rate: {baud}...")

            ser.reset_input_buffer()
            time.sleep(1)  # Wait for some data to be received

            data = ser.read(100)  # Read up to 100 bytes
            if data:
                decoded_data = data.decode(errors='ignore')
                logging.info("Received Data: %s", decoded_data)

                if is_intelligible(data):
                    logging.info("SUCCESS: Baud rate %d produced intelligible output!", baud)
                    successful_baud_rates.append(baud)
                else:
                    logging.info("FAILURE: Baud rate %d received garbled data.", baud)
            else:
                logging.info("No data received at baud rate %d.", baud)

    except serial.SerialException as e:
        logging.error("Error testing baud rate %d: %s", baud, str(e))
        print(f"Error testing baud rate {baud}: {e}")

# Print and log the results
if successful_baud_rates:
    logging.info("Possible baud rates detected: %s", successful_baud_rates)
    print("Possible correct baud rates:", successful_baud_rates)
else:
    logging.info("No intelligible data found at any baud rate.")
    print("No intelligible data found.")

logging.info("Baud rate detection completed.")
print("Baud rate detection completed. Check 'serial_baud_rate_log.txt' for details.")
