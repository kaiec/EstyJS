/*

This file is part of EstyJS.

EstyJS is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, either version 2 of the License, or (at your option) any later
version.

EstyJS is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
EstyJS. If not, see <https://www.gnu.org/licenses/>. 

Get in touch: https://github.com/kaiec/EstyJS

Original author (2013-2024): Darren Coles
Current maintainer (since 2024): Kai Eckert
*/


// keyboard emulation routines for EstyJs
// written by Darren Coles
"use strict";

EstyJs.Keyboard = function (opts) {
    var self = {};

    self.active = true;

    self.KeypadJoystick = true;

    var joystickPos = 0; //bit 7 = fire, bit 0 = up, bit 1 = down, bit 2 = left, bit 3 = right

    var clearToSend = true;
    var rxRegisterFull = false;
    var txRegisterEmpty = true;

    var output = opts.control;

    var interrupt = false;

    var mfp = opts.mfp;
    var htmlControl = opts.control;

    var control = 0;

    var mouseMode = 'R';
    //buttons action
    var mouseAction = 0;

    var port0Mouse = true;

    //max x & y for absolute mouse reporting
    var mouseXmax = 0;
    var mouseYmax = 0;

    //trigger values for keycode mouse reporting
    var mouseXkey = 0;
    var mouseYkey = 0;

    //threshold values for keycode mouse reporting
    var mouseXthreshold = 1;
    var mouseYthreshold = 1;

    var display = null

    var invertY = false;

    var paused = false;

    var joystickMode = 'E';

    var keyCommands = new Array();

    var oldMouseX = 160;
    var oldMouseY = 100;
    var mouseX = 160;
    var mouseY = 100;

    var leftDown = false;
    var rightDown = false;
    var oldLeftDown = false;
    var oldRightDown = false;

    var absLeftDownSinceLast = false;
    var absLeftUpSinceLast = false;
    var absRightDownSinceLast = false;
    var absRightUpSinceLast = false;

    var resetTime = 0;

    var dataOut = new Array();

    var locked = false;

    var readData = 0;
    var writeData = 0;

    // Physical key (KeyboardEvent.code) to ST scancode. Both name a position,
    // independently of the keyboard layout and of the browser.
    var stScancodes = {
        'Escape':          0x01,   // Esc
        'Digit1':          0x02,   // 1
        'Digit2':          0x03,   // 2
        'Digit3':          0x04,   // 3
        'Digit4':          0x05,   // 4
        'Digit5':          0x06,   // 5
        'Digit6':          0x07,   // 6
        'Digit7':          0x08,   // 7
        'Digit8':          0x09,   // 8
        'Digit9':          0x0A,   // 9
        'Digit0':          0x0B,   // 0
        'Minus':           0x0C,   // -
        'Equal':           0x0D,   // =
        'Backspace':       0x0E,   // Backspace
        'Tab':             0x0F,   // Tab
        'KeyQ':            0x10,   // Q
        'KeyW':            0x11,   // W
        'KeyE':            0x12,   // E
        'KeyR':            0x13,   // R
        'KeyT':            0x14,   // T
        'KeyY':            0x15,   // Y
        'KeyU':            0x16,   // U
        'KeyI':            0x17,   // I
        'KeyO':            0x18,   // O
        'KeyP':            0x19,   // P
        'BracketLeft':     0x1A,   // [
        'BracketRight':    0x1B,   // ]
        'Enter':           0x1C,   // Return
        'ControlLeft':     0x1D,   // Control
        'ControlRight':    0x1D,   // Control
        'KeyA':            0x1E,   // A
        'KeyS':            0x1F,   // S
        'KeyD':            0x20,   // D
        'KeyF':            0x21,   // F
        'KeyG':            0x22,   // G
        'KeyH':            0x23,   // H
        'KeyJ':            0x24,   // J
        'KeyK':            0x25,   // K
        'KeyL':            0x26,   // L
        'Semicolon':       0x27,   // ;
        'Quote':           0x28,   // '
        'Backquote':       0x29,   // `
        'ShiftLeft':       0x2A,   // left Shift
        'Backslash':       0x2B,   // \\
        'KeyZ':            0x2C,   // Z
        'KeyX':            0x2D,   // X
        'KeyC':            0x2E,   // C
        'KeyV':            0x2F,   // V
        'KeyB':            0x30,   // B
        'KeyN':            0x31,   // N
        'KeyM':            0x32,   // M
        'Comma':           0x33,   // ,
        'Period':          0x34,   // .
        'Slash':           0x35,   // /
        'ShiftRight':      0x36,   // right Shift
        'AltLeft':         0x38,   // Alternate
        'AltRight':        0x38,   // Alternate
        'Space':           0x39,   // Space
        'CapsLock':        0x3A,   // Caps Lock
        'F1':              0x3B,   // F1
        'F2':              0x3C,   // F2
        'F3':              0x3D,   // F3
        'F4':              0x3E,   // F4
        'F5':              0x3F,   // F5
        'F6':              0x40,   // F6
        'F7':              0x41,   // F7
        'F8':              0x42,   // F8
        'F9':              0x43,   // F9
        'F10':             0x44,   // F10
        'Home':            0x47,   // Home
        'ArrowUp':         0x48,   // Up
        'ArrowLeft':       0x4B,   // Left
        'ArrowRight':      0x4D,   // Right
        'ArrowDown':       0x50,   // Down
        'Insert':          0x52,   // Insert
        'Delete':          0x53,   // Delete
        'IntlBackslash':   0x60,   // the ISO key, < > on a European ST
        'PageUp':          0x61,   // Undo
        'PageDown':        0x62,   // Help
        'NumLock':         0x63,   // keypad (
        'ScrollLock':      0x64,   // keypad )
        'NumpadDivide':    0x65,   // keypad /
        'NumpadMultiply':  0x66,   // keypad *
        'NumpadSubtract':  0x4A,   // keypad -
        'NumpadAdd':       0x4E,   // keypad +
        'Numpad7':         0x67,   // keypad 7
        'Numpad8':         0x68,   // keypad 8
        'Numpad9':         0x69,   // keypad 9
        'Numpad4':         0x6A,   // keypad 4
        'Numpad5':         0x6B,   // keypad 5
        'Numpad6':         0x6C,   // keypad 6
        'Numpad1':         0x6D,   // keypad 1
        'Numpad2':         0x6E,   // keypad 2
        'Numpad3':         0x6F,   // keypad 3
        'Numpad0':         0x70,   // keypad 0
        'NumpadDecimal':   0x71,   // keypad .
        'NumpadEnter':     0x72,   // keypad Enter
    };

    function toBCD(v) {
        return (Math.floor(v / 10) << 4) + (v % 10);
    }

    function lockChange() {
        var requestedElement = document.getElementById(output);


        if (document.pointerLockElement === requestedElement ||
          document.mozPointerLockElement === requestedElement ||
          document.webkitPointerLockElement === requestedElement) {
            // Pointer was just locked
            // Enable the mousemove listener
            htmlElement.onmousemove = mouseMove2;
            locked = true;
        } else {
            // Pointer was just unlocked
            // Disable the mousemove listener
            htmlElement.onmousemove = mouseMove;
            locked = false;
        }
    }

    function mouseLeave(evt){
        // console.log("Mouse left")
        self.resetMouse()
    }

    function mouseEnter(evt) {
        // console.log("Mouse entered: " + evt.mouseX +  "/" + evt.mouseY)
    }

    function mouseMove(evt) {
        mouseX = (evt.pageX - htmlElement.offsetLeft);
        mouseY = (evt.pageY - htmlElement.offsetTop);
        mouseX *= (640/htmlElement.offsetWidth)
        mouseY *= (400/htmlElement.offsetHeight)
        switch (display.readScreenMode()) {
            // intentional fall through!
            case 0:
                mouseX >>= 1
            case 1:
                mouseY >>= 1
        }
        // console.log("Mouse :" + mouseMode + "  " + mouseX + " / " + mouseY)
    }

    function mouseMove2(e) {
        var movementX = e.movementX ||
              e.mozMovementX ||
              e.webkitMovementX ||
              0,
          movementY = e.movementY ||
              e.mozMovementY ||
              e.webkitMovementY ||
              0;

        mouseX = mouseX + movementX;
        mouseY = mouseY + movementY;

        if (oldMouseX == -10000) {
            oldMouseX = mouseX;
            oldMouseY = mouseY;
        }
    }

    function mouseDown(evt) {
        switch (evt.button) {
            case 0:
                evt.stopPropagation();
                leftDown = true;
                absLeftDownSinceLast = true;
                break;
            case 2:
                evt.stopPropagation();
                rightDown = true;
                absRightDownSinceLast = true;
                break;
            case 1:
                evt.stopPropagation();
                self.resetMouse();
                break;
        }
        evt.preventDefault();
        return true;

    }

    function mouseUp(evt) {
        switch (evt.button) {
            case 0:
                evt.stopPropagation();

                leftDown = false;
                absLeftUpSinceLast = true;
                break;
            case 2:
                evt.stopPropagation();
                rightDown = false;
                absRightUpSinceLast = true;
                break;
        }
        evt.preventDefault();
        return true;
    }

    function keyDown(evt) {
        if (self.active) {
            //TOS repeats held keys, the keyboard does not; browser repeats
            //would be make codes without a break
            if (!evt.repeat) registerKeyDown(evt.code);
            if (!evt.metaKey) return false;
        }
    }
    function registerKeyDown(physicalKey) {
        var keyCode = stScancodes[physicalKey];
        if (keyCode == null) return;

        if (self.onKey) self.onKey(keyCode, true, physicalKey);

        if (resetTime > 0) return;

        //75 = left cursor, 77 = right cursor, 80 = down, 72 = up, 0x1d = control
        if (self.KeypadJoystick && (keyCode == 75 || keyCode == 77 || keyCode == 72 || keyCode == 80 || keyCode == 0x1D)) {
            switch (keyCode) {
                //bit 0 = left, bit 1 = right, bit 2 = up, bit 3 = down, bit 7 = fire                                   
                case 72:
                    //up
                    joystickPos |= 1;
                    break;
                case 80:
                    //down
                    joystickPos |= 2;
                    break;
                case 75:
                    //left
                    joystickPos |= 4;
                    break;
                case 77:
                    //right
                    joystickPos |= 8;
                    break;
                case 0x1d:
                    //fire
                    joystickPos |= 128;
                    break;

            }

            //if port0mouse joystick sends right mouse click instead of fire
            if ((keyCode == 0x1d) && port0Mouse) {
                if (mouseAction == 4 || mouseMode == 'K') {
                    dataOut.push(0x75);
                } else if (mouseMode == 'R') {
                    dataOut.push(0xf9 | (leftDown ? 2 : 0)); //mouse buttons
                    dataOut.push(0);
                    dataOut.push(0);
                }
            }

            if (joystickMode == 'E' && (keyCode != 0x1d | !port0Mouse)) {
                //fe = joystick 0, ff = joystick 1
                dataOut.push(0xff);
                dataOut.push(joystickPos)
            }

        } else {
            dataOut.push(keyCode)
        }
    }
    function keyUp(evt) {
        registerKeyUp(evt.code);
        if (self.active && !evt.metaKey) return false;
    }
    function registerKeyUp(physicalKey) {
        var keyCode = stScancodes[physicalKey];
        if (keyCode == null) return;

        if (self.onKey) self.onKey(keyCode, false, physicalKey);

        if (resetTime > 0) return;

        if (self.KeypadJoystick && (keyCode == 75 || keyCode == 77 || keyCode == 72 || keyCode == 80 || keyCode == 0x1D)) {
            switch (keyCode) {
                //bit 0 = left, bit 1 = right, bit 2 = up, bit 3 = down, bit 7 = fire                                   
                case 72:
                    //up
                    joystickPos &= 0xff - 1;
                    break;
                case 80:
                    //down
                    joystickPos &= 0xff - 2;
                    break;
                case 75:
                    //left
                    joystickPos &= 0xff - 4;
                    break;
                case 77:
                    //right
                    joystickPos &= 0xff - 8;
                    break;
                case 0x1d:
                    //fire
                    joystickPos &= 0xff - 128;
                    break;

            }

            //if port0mouse joystick sends right mouse click instead of fire
            if ((keyCode == 0x1d) && port0Mouse) {
                if (mouseAction == 4 || mouseMode == 'K') {
                    dataOut.push(0xf5);
                } else if (mouseMode == 'R') {
                    dataOut.push(0xf8 | (leftDown ? 2 : 0)); //mouse buttons
                    dataOut.push(0);
                    dataOut.push(0);
                }
            }

            if (joystickMode == 'E' && (keyCode != 0x1d | !port0Mouse)) {
                //fe = joystick 0, ff = joystick 1
                dataOut.push(0xff);
                dataOut.push(joystickPos)
            }

        } else {
            dataOut.push(0x80 | keyCode)
        }
    }

    function keyPress(evt) {
        if (self.active && !evt.metaKey) return false;
    }

    // An ST key with no host key involved, for the on screen keyboard.
    self.pressKey = function (scancode) {
        if (scancode) dataOut.push(scancode & 0x7f);
    }

    self.releaseKey = function (scancode) {
        if (scancode) dataOut.push(0x80 | (scancode & 0x7f));
    }

    // Called for every key the host sends: (scancode, down, physicalKey).
    self.onKey = null;

    self.checkJoystick = function () {
        var newJoystickPos = 0;

        var gamepad = null;
        if (navigator.getGamepads && navigator.getGamepads().length > 0) gamepad = navigator.getGamepads()[0];

        if (gamepad != null) {
            //up
            if (gamepad.buttons.length > 12 && gamepad.buttons[12].pressed) newJoystickPos |= 1;
            //down
            if (gamepad.buttons.length > 13 && gamepad.buttons[13].pressed) newJoystickPos |= 2;
            //left
            if (gamepad.buttons.length > 14 && gamepad.buttons[14].pressed) newJoystickPos |= 4;
            //right
            if (gamepad.buttons.length > 15 && gamepad.buttons[15].pressed) newJoystickPos |= 8;

            //up
            if (gamepad.axes.length > 0 && gamepad.axes[1] < -0.5) newJoystickPos |= 1;
            //down
            if (gamepad.axes.length > 0 && gamepad.axes[1] > 0.5) newJoystickPos |= 2;
            //left
            if (gamepad.axes.length > 1 && gamepad.axes[0] < -0.5) newJoystickPos |= 4;
            //right
            if (gamepad.axes.length > 1 && gamepad.axes[0] > 0.5) newJoystickPos |= 8;

            //any other fire buttons
            for (var i = 0; i < 12; i++) {
                if (gamepad.buttons.length > i && gamepad.buttons[i].pressed) newJoystickPos |= 128;
            }

            if (newJoystickPos != joystickPos) {
                joystickPos = newJoystickPos
                if (joystickMode == 'E' && !port0Mouse) {
                    //fe = joystick 0, ff = joystick 1
                    dataOut.push(0xff);
                    dataOut.push(joystickPos)
                }
            }
        }

        
    }

    self.readkeys = function () {
    }

    self.setControl = function (val) {
        control = val;
        if ((control & 0x3) == 3) {
            //reset
            interrupt = false;
            rxRegisterFull = false;
            txRegisterEmpty = true;
            dataOut.length = 0;
            mfp.setAciaGpio();

        }
    }

    self.readControl = function () {
        return (
		  (interrupt ? 0x80 : 0) |    // interrupt
		  (rxRegisterFull ? 1 : 0) | //receive byte ready	
		  (txRegisterEmpty ? 2 : 0) | //transmit data buffer empty
		  (clearToSend ? 8 : 0)); //ok to send
    }

    self.readData = function () {
        interrupt = false;
        mfp.setAciaGpio();
        rxRegisterFull = false;
        return readData;
    }

    self.processCommand = function (cmd) {
        txRegisterEmpty = false;
        writeData = cmd;
    }
    ;
    self.processRow = function (processor) {
        if (resetTime > 0) {
            resetTime--;
            if (!resetTime) {
                //self check completed ok.
                dataOut.push(0xF0);
            }


        }

        if (!txRegisterEmpty) {
            keyCommands.push(writeData);
            txRegisterEmpty = true;
        }

        if (dataOut.length > 0 && !rxRegisterFull && !paused) {
            readData = (dataOut.shift()) & 0xff;
            rxRegisterFull = true; //set receive data register full
        }

        //trigger interrupt
        if ((control & 0x80) && (rxRegisterFull)) {
            interrupt = true;
            mfp.clearAciaGpio();
            mfp.interruptRequest(6);
        }


        if (mouseAction == 4) {
            if (leftDown & !oldLeftDown) dataOut.push(0x74);
            if (!leftDown & oldLeftDown) dataOut.push(0xf4);
            if (rightDown & !oldRightDown) dataOut.push(0x75);
            if (!rightDown & oldRightDown) dataOut.push(0xf5);
        }


        if (joystickMode == 'E' && (leftDown != oldLeftDown) && !port0Mouse) {
            //fe = joystick 0, ff = joystick 1
            dataOut.push(0xfe);
            dataOut.push(leftDown ? 128 : 0)
        }


        if (mouseMode == 'R' && !resetTime && port0Mouse) {
            var xd = mouseX - oldMouseX;
            var yd = mouseY - oldMouseY;

            if ((Math.abs(xd) > mouseXthreshold) || (Math.abs(yd) > mouseYthreshold) || oldLeftDown != leftDown || oldRightDown != rightDown) {
                self.moveMouse(xd, yd)
                oldMouseX = mouseX;
                oldMouseY = mouseY;
            }
        }

        /*if (mouseMode == 'A' && !resetTime) {
        var xd = (mouseX - oldMouseX) >> 1;
        var yd = (mouseY - oldMouseY) >> 1;

        if ((Math.abs(xd) > mouseXthreshold) || (Math.abs(yd) > mouseYthreshold) || oldLeftDown != leftDown || oldRightDown != rightDown) {
        dataOut.push(0xf8 | (leftDown ? 2 : 0) | (rightDown ? 1 : 0)); //mouse buttons
        dataOut.push(xd);
        if (invertY) {
        dataOut.push(-yd);
        } else {
        dataOut.push(yd);
        }

        oldMouseX = mouseX;
        oldMouseY = mouseY;
        oldLeftDown = leftDown;
        oldRightDown = rightDown;
        }
        }*/

        if (keyCommands.length > 0) {

            var keyCmd = keyCommands[0];

            var paramCount;

            switch (keyCmd) {
                case 0x07:
                case 0x80:
                    paramCount = 1;
                    break;
                case 0x09:
                    paramCount = 4;
                    break;
                case 0x0A:
                case 0x0B:
                case 0x0C:
                case 0x21:
                case 0x22:
                    paramCount = 2;
                    break;
                case 0x0E:
                    paramCount = 5;
                    break;
                case 0x19:
                case 0x1B:
                    paramCount = 6;
                    break;
                case 0x20:
                    //memory load variable length
                    if (keyCommands.length < 3) return;
                    paramCount = 2 + keyCommands[3];
                default:
                    paramCount = 0;
            }

            if (keyCommands.length < paramCount + 1) return;
            keyCommands.shift();

            paused = false;

            switch (keyCmd) {
                case 0x80:
                    //keyboard reset
                    var keyCmd2 = keyCommands.shift();

                    if (keyCmd2 != 1) return;
                    joystickMode = 'E';
                    joystickPos = 0;
                    mouseAction = 0;
                    mouseMode = 'R';
                    port0Mouse = true;

                    resetTime = 400;
                    break;

                case 0x07:
                    //mouse button action
                    port0Mouse = true;
                    mouseAction = keyCommands.shift();
                    break;
                case 0x08:
                    //relative mouse position reporting
                    port0Mouse = true;
                    mouseMode = 'R';
                    break;
                case 0x09:
                    //absolute mouse position reporting
                    mouseMode = 'A';
                    port0Mouse = true;
                    mouseXmax = (keyCommands.shift() << 8) + keyCommands.shift();
                    mouseYmax = (keyCommands.shift() << 8) + keyCommands.shift();
                    break;
                case 0x0A:
                    //keycode mouse poisition reporting
                    mouseMode = 'K';
                    port0Mouse = true;
                    mouseXkey = keyCommands.shift();
                    mouseYkey = keyCommands.shift();
                    break;
                case 0x0B:
                    //set threshold
                    port0Mouse = true;
                    mouseXthreshold = keyCommands.shift();
                    mouseYthreshold = keyCommands.shift();
                    break;
                case 0x0C:
                    //set scale
                    port0Mouse = true;
                    mouseXscale = keyCommands.shift();
                    mouseYscale = keyCommands.shift();
                    break;
                case 0x0D:
                    //interrogate mouse position
                    port0Mouse = true;

                    if (dataOut.length > 255) break;

                    dataOut.push(0xf7);
                    dataOut.push(0 | (absLeftUpSinceLast ? 8 : 0) | (absLeftDownSinceLast ? 4 : 0) | (absRightUpSinceLast ? 2 : 0) | (absRightDownSinceLast ? 1 : 0));
                    dataOut.push(Math.floor((mouseX / htmlElement.width() * mouseXmax) >> 8));
                    dataOut.push(Math.floor((mouseX / htmlElement.width() * mouseXmax) & 0xff));
                    dataOut.push(Math.floor((mouseY / htmlElement.height() * mouseYmax) >> 8));
                    dataOut.push(Math.floor((mouseY / htmlElement.height() * mouseYmax) & 0xff));
                    absLeftDownSinceLast = false;
                    absLeftUpSinceLast = false;
                    absRightDownSinceLast = false;
                    absRightUpSinceLast = false;

                    break;
                case 0x0E:
                    //set mouse position
                    //not yet implemented
                    port0Mouse = true;
                    keyCommands.shift();
                    keyCommands.shift();
                    keyCommands.shift();
                    keyCommands.shift();
                    keyCommands.shift();
                    break;
                case 0x0F:
                    //set y at bottom
                    port0Mouse = true;
                    invertY = true;
                    break;
                case 0x10:
                    //set y at top
                    port0Mouse = true;
                    invertY = false;
                    break;
                case 0x11:
                    //resume
                    // do nothing - any command unpauses
                    break;
                case 0x12:
                    //disable mouse
                    port0Mouse = false;
                    mouseMode = '';
                    break;
                case 0x13:
                    //pause
                    paused = true;
                    break;
                case 0x14:
                    //set joystick event reporting
                    port0Mouse = false;
                    joystickMode = 'E';
                    break;
                case 0x15:
                    //disable joystick event reporting
                    joystickMode = '';
                    break;
                case 0x16:
                    //interrogate joystick
                    port0Mouse = false;
                    if (dataOut.length > 255) break;

                    dataOut.push(0xfd);
                    dataOut.push(0);
                    dataOut.push(joystickPos);
                    break;
                case 0x17:
                    //set joystick monitoring
                    //not yet implemented
                    port0Mouse = false;
                    break;
                case 0x18:
                    //set fire button monitoring
                    //not yet implemented
                    port0Mouse = false;
                    break;
                case 0x19:
                    //set joystick keycode mode
                    port0Mouse = false;
                    joystickMode = 'K';
                    keyCommands.shift();
                    keyCommands.shift();
                    keyCommands.shift();
                    keyCommands.shift();
                    keyCommands.shift();
                    keyCommands.shift();
                    break;
                case 0x1A:
                    //disable joystick
                    joystickMode = '';
                    break;
                case 0x1B:
                    //time of day clock set
                    keyCommands.shift();
                    keyCommands.shift();
                    keyCommands.shift();
                    keyCommands.shift();
                    keyCommands.shift();
                    keyCommands.shift();
                    break;
                case 0x1C:
                    //query time of day clock
                    var currDate = new Date();
                    dataOut.push(0xfc);
                    dataOut.push(toBCD(currDate.getFullYear() % 100));
                    dataOut.push(toBCD(currDate.getMonth() + 1));
                    dataOut.push(toBCD(currDate.getDate()));
                    dataOut.push(toBCD(currDate.getHours()));
                    dataOut.push(toBCD(currDate.getMinutes()));
                    dataOut.push(toBCD(currDate.getSeconds()));
                    break;

                case 0x20:
                    //memory load
                    //not implemented
                    break;
                case 0x21:
                    //memory read
                    //not implemented
                    break;
                case 0x22:
                    //controller execute
                    //not implemented
                    break;

                case 0x87:
                    //mouse button action status inquiry
                    if (dataOut.length > 255) break;

                    dataOut.push(0xf6);
                    dataOut.push(mouseAction);
                    dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0);

                    break;

                case 0x88:
                case 0x89:
                case 0x8A:
                    //mouse mode status inquiry
                    //mode        ; 0x08 is RELATIVE
                    //   ; 0x09 is ABSOLUTE
                    //   ; 0x0A is KEYCODE
                    switch (mouseMode) {
                        case 'R':
                            dataOut.push(0xf6);
                            dataOut.push(0x8);
                            break;
                        case 'A':
                            dataOut.push(0xf6);
                            dataOut.push(0x9);
                            break;
                        case 'K':
                            dataOut.push(0xf6);
                            dataOut.push(0xA);
                            break;
                    }
                    dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0);
                    break;

                case 0x8B:
                    //mouse threshold inquiry
                    dataOut.push(0xf6);
                    dataOut.push(mouseXthreshold);
                    dataOut.push(mouseYthreshold);
                    dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0);
                    break;

                case 0x8C:
                    //mouse scale inquiry
                    dataOut.push(0xf6);
                    dataOut.push(mouseXscale);
                    dataOut.push(mouseYscale);
                    dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0);
                    break;

                case 0x8F:
                case 0x90:
                    //mouse invery inquiry
                    dataOut.push(0xf6);
                    if (invertY) {
                        dataOut.push(0x10);
                    } else {
                        dataOut.push(0xF);
                    }
                    dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0);
                    break;
                case 0x92:
                    //mouse enable inquiry
                    dataOut.push(0xf6);
                    if (mouseMode == '') {
                        dataOut.push(0x12);
                    } else {
                        dataOut.push(0);
                    }
                    dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0);
                    break;
                case 0x94:
                case 0x95:
                case 0x96:
                    //joystick mode inquiry
                    dataOut.push(0xf6);

                    //joystick mode to be implemented
                    dataOut.push(0);

                    dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0);

                case 0x9A:
                    //joystick mode inquiry
                    dataOut.push(0xf6);
                    if (joystickMode == '') {
                        dataOut.push(0x1A);
                    } else {
                        dataOut.push(0);
                    }
                    dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0); dataOut.push(0);

                    break;
            }

        }

    }

    var htmlElement = document.getElementById(htmlControl);
    document.onkeydown = keyDown;
    document.onkeyup = keyUp;
    document.onkeypress = keyPress;
    htmlElement.onmousemove = mouseMove;
    htmlElement.onmousedown = mouseDown;
    htmlElement.onmouseenter = mouseEnter;
    htmlElement.onmouseleave = mouseLeave;
    htmlElement.onmouseup = mouseUp;
    htmlElement.oncontextmenu = function () {
        return false;
    }

    self.setSnapshotRegs = function (regs) {
        mouseMode = regs.mouseMode;
        joystickMode = regs.joystickMode;
    }

    self.resetMouse = function() {
        self.moveMouse(640, 400)
        mouseX = display.readScreenMode()==0?319:639;
        mouseY=display.readScreenMode()==2?399:199;
        oldMouseX = mouseX;
        oldMouseY = mouseY;
    }

    self.moveMouse = function(dx, dy) {
        // console.log("Moving mouse: " + dx + "/" + dy)
        while (dx!=0  || dy!=0 || leftDown!=oldLeftDown || rightDown!=oldRightDown) {
            // console.log("Step: " + dx + "/" + dy)
            var dxb = Math.max(-127, Math.min(dx, 127))
            var dyb = Math.max(-127, Math.min(dy, 127))
            dataOut.push(0xf8 | (leftDown ? 2 : 0) | (rightDown ? 1 : 0));
            dataOut.push(dxb);
            if (invertY) {
                dataOut.push(-dyb);
            } else {
                dataOut.push(dyb);
            }
            dx-=dxb
            dy-=dyb
            oldLeftDown = leftDown
            oldRightDown = rightDown
        }
    }

    self.setMousePos = function() {

    }

    self.lockMouse = function () {
        var havePointerLock = 'pointerLockElement' in document ||
            'mozPointerLockElement' in document ||
            'webkitPointerLockElement' in document;

        if (havePointerLock) {

            // Hook pointer lock state change events
            document.addEventListener('pointerlockchange', lockChange, false);
            document.addEventListener('mozpointerlockchange', lockChange, false);
            document.addEventListener('webkitpointerlockchange', lockChange, false);

            htmlElement = document.getElementById(output);

            htmlElement.requestPointerLock = htmlElement.requestPointerLock ||
                                htmlElement.mozRequestPointerLock ||
                                htmlElement.webkitRequestPointerLock;

            if (!locked) {

                // Ask the browser to lock the pointer
                htmlElement.requestPointerLock();
            } else {
                htmlElement.exitPointerLock();
            }

            // Hook pointer lock state change events

            /*document.addEventListener('pointerlockchange', changeCallback, false);
            document.addEventListener('mozpointerlockchange', changeCallback, false);
            document.addEventListener('webkitpointerlockchange', changeCallback, false);*/
        }
    }

    self.mouseLocked = function () {
        return locked;
    }


    self.setDisplay = function (d) {
        display = d;
    }


    return self;
}

