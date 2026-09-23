# Joystick

Joystick 1 is emulated using cursor keys and ctrl, or a USB gamepad. The Joystick button switches
this off, so that cursor keys and ctrl reach the ST as keys.

A gamepad is read once per frame: D-pad, left stick, and buttons 0 to 11 as fire.

Not supported:

- Joystick port 0 (the mouse port), so no two player games.
- Keyboard and gamepad at the same time. A connected gamepad overwrites the keyboard state every
  frame.
- A second gamepad, non-standard button mappings, remapping, autofire, dead zone settings.
- Touch screens.
