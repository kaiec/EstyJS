# Joystick

Joystick 1 is emulated using cursor keys and ctrl, or a USB gamepad. The Joystick button switches
this off, so that cursor keys and ctrl reach the ST as keys.

A gamepad is read once per frame. The first connected gamepad counts.

- A gamepad the browser knows (standard mapping): D-pad, left stick, and buttons 0 to 11 as fire.
- Any other gamepad: axes 0 and 1, and buttons 0 to 3 as fire. Many have the D-pad elsewhere.

The Gamepad panel below the screen sets up a gamepad: press up, right, down, left and fire when
asked. A D-pad on buttons, on two axes or on one hat switch axis all work. The layout is kept in the
browser per gamepad name and used instead of the above. Browsers name and lay out the same gamepad
differently, so a gamepad is set up once per browser.

Not supported:

- Joystick port 0 (the mouse port), so no two player games.
- Keyboard and gamepad at the same time. A connected gamepad overwrites the keyboard state every
  frame.
- A second gamepad, autofire, dead zone settings.
- Touch screens.
