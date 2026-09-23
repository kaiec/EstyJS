# Keyboard

Keys are identified by position, not by the character they produce: the emulator reads
`KeyboardEvent.code`, which names the physical key the same way on every keyboard layout and in
every browser, and an ST scancode means a position too. So the table below is the whole story
regardless of whether the keyboard is US, German or French - what matters is where a key sits, not
what is printed on it.

The consequence worth knowing: EmuTOS here uses a US keyboard table. On a German keyboard the key
marked `Z` sits where a US keyboard has `Y`, so the ST receives `Y`. That is the right answer for
games, which read scancodes by position, and the wrong one for typing. A symbolic mode, where the
character matters more than the position, would be a second mapping on top of this one.

Keys the ST has and a PC does not:

| ST key | Where it is |
| --- | --- |
| Undo | `PageUp` |
| Help | `PageDown` |
| ISO key (`< >` on a European ST) | `IntlBackslash`, the key beside left shift on ISO keyboards |
| Keypad `(` | `NumLock` |
| Keypad `)` | `ScrollLock` |

Cursor keys and control are joystick 1 unless the Joystick button is switched off.

The page draws an ST keyboard under the machine: press a key and the ST key it arrives as lights up,
click a key and it is sent to the ST. Clicking is the only way to reach the keypad's `(` and `)`,
which a PC keyboard has no equivalent for. The keycaps switch between the US, UK, German and French
ST keyboards - that changes the legends, not what the ST types, which follows the keyboard table in
the TOS image (US for the EmuTOS built in here).

The legends come from EmuTOS's own country tables (`bios/keyb_<country>.h`), and the key positions
are those of a real ST: a US ST has no key between the left shift and Z, where every European model
has one, so the panel grows and shrinks the shift key with the country.

`node tools/check-keymap.js` checks that every physical key reaches the ST as the right scancode and
`--list` prints the table; `node tools/check-onscreen-keyboard.js` checks the panel's layout and
keycaps.

<details>
<summary>The full mapping, all 97 physical keys</summary>

| Physical key | ST key | Scancode |
| --- | --- | --- |
| `Escape` | `Esc` | `0x01` |
| `Digit1` | `1` | `0x02` |
| `Digit2` | `2` | `0x03` |
| `Digit3` | `3` | `0x04` |
| `Digit4` | `4` | `0x05` |
| `Digit5` | `5` | `0x06` |
| `Digit6` | `6` | `0x07` |
| `Digit7` | `7` | `0x08` |
| `Digit8` | `8` | `0x09` |
| `Digit9` | `9` | `0x0A` |
| `Digit0` | `0` | `0x0B` |
| `Minus` | `-` | `0x0C` |
| `Equal` | `=` | `0x0D` |
| `Backspace` | `Backspace` | `0x0E` |
| `Tab` | `Tab` | `0x0F` |
| `KeyQ` | `Q` | `0x10` |
| `KeyW` | `W` | `0x11` |
| `KeyE` | `E` | `0x12` |
| `KeyR` | `R` | `0x13` |
| `KeyT` | `T` | `0x14` |
| `KeyY` | `Y` | `0x15` |
| `KeyU` | `U` | `0x16` |
| `KeyI` | `I` | `0x17` |
| `KeyO` | `O` | `0x18` |
| `KeyP` | `P` | `0x19` |
| `BracketLeft` | `[` | `0x1A` |
| `BracketRight` | `]` | `0x1B` |
| `Enter` | `Return` | `0x1C` |
| `ControlLeft` | `Control` | `0x1D` |
| `ControlRight` | `Control` | `0x1D` |
| `KeyA` | `A` | `0x1E` |
| `KeyS` | `S` | `0x1F` |
| `KeyD` | `D` | `0x20` |
| `KeyF` | `F` | `0x21` |
| `KeyG` | `G` | `0x22` |
| `KeyH` | `H` | `0x23` |
| `KeyJ` | `J` | `0x24` |
| `KeyK` | `K` | `0x25` |
| `KeyL` | `L` | `0x26` |
| `Semicolon` | `;` | `0x27` |
| `Quote` | `'` | `0x28` |
| `Backquote` | ``` | `0x29` |
| `ShiftLeft` | `left Shift` | `0x2A` |
| `Backslash` | `\\` | `0x2B` |
| `KeyZ` | `Z` | `0x2C` |
| `KeyX` | `X` | `0x2D` |
| `KeyC` | `C` | `0x2E` |
| `KeyV` | `V` | `0x2F` |
| `KeyB` | `B` | `0x30` |
| `KeyN` | `N` | `0x31` |
| `KeyM` | `M` | `0x32` |
| `Comma` | `,` | `0x33` |
| `Period` | `.` | `0x34` |
| `Slash` | `/` | `0x35` |
| `ShiftRight` | `right Shift` | `0x36` |
| `AltLeft` | `Alternate` | `0x38` |
| `AltRight` | `Alternate` | `0x38` |
| `Space` | `Space` | `0x39` |
| `CapsLock` | `Caps Lock` | `0x3A` |
| `F1` | `F1` | `0x3B` |
| `F2` | `F2` | `0x3C` |
| `F3` | `F3` | `0x3D` |
| `F4` | `F4` | `0x3E` |
| `F5` | `F5` | `0x3F` |
| `F6` | `F6` | `0x40` |
| `F7` | `F7` | `0x41` |
| `F8` | `F8` | `0x42` |
| `F9` | `F9` | `0x43` |
| `F10` | `F10` | `0x44` |
| `Home` | `Home` | `0x47` |
| `ArrowUp` | `Up` | `0x48` |
| `ArrowLeft` | `Left` | `0x4B` |
| `ArrowRight` | `Right` | `0x4D` |
| `ArrowDown` | `Down` | `0x50` |
| `Insert` | `Insert` | `0x52` |
| `Delete` | `Delete` | `0x53` |
| `IntlBackslash` | the ISO key, < > on a European ST | `0x60` |
| `PageUp` | `Undo` | `0x61` |
| `PageDown` | `Help` | `0x62` |
| `NumLock` | keypad ( | `0x63` |
| `ScrollLock` | keypad ) | `0x64` |
| `NumpadDivide` | keypad / | `0x65` |
| `NumpadMultiply` | keypad * | `0x66` |
| `NumpadSubtract` | keypad - | `0x4A` |
| `NumpadAdd` | keypad + | `0x4E` |
| `Numpad7` | keypad 7 | `0x67` |
| `Numpad8` | keypad 8 | `0x68` |
| `Numpad9` | keypad 9 | `0x69` |
| `Numpad4` | keypad 4 | `0x6A` |
| `Numpad5` | keypad 5 | `0x6B` |
| `Numpad6` | keypad 6 | `0x6C` |
| `Numpad1` | keypad 1 | `0x6D` |
| `Numpad2` | keypad 2 | `0x6E` |
| `Numpad3` | keypad 3 | `0x6F` |
| `Numpad0` | keypad 0 | `0x70` |
| `NumpadDecimal` | keypad . | `0x71` |
| `NumpadEnter` | keypad Enter | `0x72` |

</details>
