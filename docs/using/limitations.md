# Limitations

EstyJS is not a full emulation and focuses on running games or old software for demonstration
purposes. The notable limitations:

- Copy protection that relies on disk rotation or timing is not emulated, so some original disks
  still refuse to run. See [disk images](disks.md).
- No writing to floppies. Disks are reported to TOS as write protected.
- Joystick port 0 is not emulated, so two player games do not work. A connected gamepad takes over
  from the cursor keys. See [joystick](joystick.md).
- Timer pulse width and accuracy below one scanline are not supported.
- No border effects (as used by some demos); only the official resolutions are supported.
