# Limitations

EstyJS is not a full emulation and focuses on running games or old software for demonstration
purposes.

- A written disk is kept in memory only and is lost on reload. See [disk images](disks.md).
- Copy protection based on disk rotation or timing is not emulated. See
  [disk images](disks.md).
- Joystick port 0 is not emulated, so two player games do not work. See [joystick](joystick.md).
- Timer pulse width & high accuracy < 1 scanline is not supported.
- No border effects (as used by some demos), only the official resolutions are supported.
- No STE, TT or Falcon. No blitter, DMA sound, MIDI, RS232, printer, cartridge or hard disk.
