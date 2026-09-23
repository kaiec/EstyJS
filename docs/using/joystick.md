# Joystick

Joystick 1 is emulated with the cursor keys and control, or with a real USB gamepad. The
**Joystick** button in the panel turns that off, so that the cursor keys and control reach the ST as
keys again - see [keyboard](keyboard.md).

A gamepad is read through the browser's Gamepad API, once per frame: the D-pad, the left stick, and
any of the first twelve buttons as fire.

What is missing:

- **Joystick port 0**, the one shared with the mouse, is not emulated at all. Two player games and
  the titles that read joystick 0 cannot be played.
- A connected gamepad **takes over from the cursor keys**: its state replaces the keyboard's every
  frame, so plugging one in stops the keys working.
- Only the first gamepad is read, only the standard button mapping, with a fixed dead zone and no
  way to remap buttons or turn on autofire.
- There is nothing for touch screens.
