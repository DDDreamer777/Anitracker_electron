# led_interface.py
import board        #for Raspberry Pi GPIO
import neopixel    #for controlling NeoPixel LEDs
import socket
import threading

# ----------------------------
# Hardware setup
# ----------------------------
PIXEL_PIN = board.D18       # GPIO pin connected to the LED data input
NUM_PIXELS = 64             # total LEDs
CENTER_LEDS = [27,28,29,35,36,37,43,44,45]  # 8x8 matrix, 3x3 center (index from 0)
pixels = neopixel.NeoPixel(PIXEL_PIN, NUM_PIXELS, auto_write=False)

# ----------------------------
# Functions to control LEDs
# ----------------------------
def set_center_leds(color):
    """Set the 3x3 center LEDs to the given color"""
    for i in CENTER_LEDS:
        pixels[i] = color
    pixels.show()

def turn_off_center():
    """Turn off the center LEDs"""
    set_center_leds((0,0,0))

# ----------------------------
# Terminal interface (human input)
# ----------------------------
def terminal_interface():
    print("Keyboard control: r=red, g=green, b=blue, w=white, o=off, q=quit")
    while True:
        cmd = input("Enter command: ").strip().lower()
        if cmd == "r":
            set_center_leds((255,0,0))
        elif cmd == "g":
            set_center_leds((0,255,0))
        elif cmd == "b":
            set_center_leds((0,0,255))
        elif cmd == "w":
            set_center_leds((255,255,255))
        elif cmd == "o":
            turn_off_center()
        elif cmd == "q":
            turn_off_center()
            break
        else:
            print("Unknown command")

# ----------------------------
# TCP interface (computer code interface)
# ----------------------------
def tcp_interface(host='0.0.0.0', port=9999):
    """TCP server allows external programs to control LEDs"""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind((host, port))
    s.listen(1)
    print(f"TCP interface running on {host}:{port}")
    
    while True:
        conn, addr = s.accept()
        print(f"Connected by {addr}")
        with conn:
            while True:
                data = conn.recv(1024)
                if not data:
                    break
                cmd = data.decode().strip().lower()
                if cmd == "red":
                    set_center_leds((255,0,0))
                elif cmd == "green":
                    set_center_leds((0,255,0))
                elif cmd == "blue":
                    set_center_leds((0,0,255))
                elif cmd == "white":
                    set_center_leds((255,255,255))
                elif cmd == "off":
                    turn_off_center()
                elif cmd == "quit":
                    turn_off_center()
                    break
                conn.sendall(b"OK\n")

# ----------------------------
# Main: run both interfaces concurrently
# ----------------------------
if __name__ == "__main__":
    threading.Thread(target=tcp_interface, daemon=True).start()  # TCP interface runs in background
    terminal_interface()  # terminal interface runs in foreground

