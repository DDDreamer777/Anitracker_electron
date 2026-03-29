# audio_interface_aplay.py
import os
import threading
import socket
import subprocess

# ----------------------------
# Configuration
# ----------------------------
AUDIO_BACKEND = "RPI"  # RPI = Raspberry Pi speaker
DEFAULT_AUDIO_DIR = "./audio_files"  # Directory for audio files

# ----------------------------
# Audio functions
# ----------------------------
def play_audio(file_name):
    """
    Play a WAV audio file using 'aplay' on Raspberry Pi.
    """
    file_path = os.path.join(DEFAULT_AUDIO_DIR, file_name)
    
    if not os.path.exists(file_path):
        print(f"[ERROR] Audio file not found: {file_path}")
        return
    
    def _play():
        if AUDIO_BACKEND == "RPI":
            # Use subprocess for better async control
            try:
                subprocess.Popen(["aplay", file_path])
            except Exception as e:
                print(f"[ERROR] aplay failed: {e}")
        else:
            print("[ERROR] Unknown AUDIO_BACKEND")
    
    # Play asynchronously, do not block main thread
    threading.Thread(target=_play, daemon=True).start()

# ----------------------------
# TCP interface for external control
# ----------------------------
def tcp_interface(host='0.0.0.0', port=9998):
    """
    TCP server to control audio playback from a computer.
    Commands: filename.wav or 'quit' to stop the server.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind((host, port))
    s.listen(1)
    print(f"[Audio TCP interface running on {host}:{port}]")
    
    while True:
        conn, addr = s.accept()
        print(f"[Audio] Connected by {addr}")
        with conn:
            while True:
                data = conn.recv(1024)
                if not data:
                    break
                cmd = data.decode().strip()
                if cmd.lower() == "quit":
                    print("[Audio] Quit command received. Closing server.")
                    conn.sendall(b"OK\n")
                    return
                else:
                    print(f"[Audio] Play command received: {cmd}")
                    play_audio(cmd)
                    conn.sendall(b"OK\n")

# ----------------------------
# Test / Terminal interface
# ----------------------------
def terminal_interface():
    print("Keyboard audio test: enter WAV filename in ./audio_files or 'q' to quit")
    while True:
        cmd = input("Enter audio filename: ").strip()
        if cmd.lower() == "q":
            break
        play_audio(cmd)

# ----------------------------
# Main: run TCP and terminal concurrently
# ----------------------------
if __name__ == "__main__":
    threading.Thread(target=tcp_interface, daemon=True).start()
    terminal_interface()

