// main initialisation routines for EstyJs
// written by Darren Coles
"use strict";

var estyjs = null;			

setTimeout(mouseLocked, 1250);

function reset() {
	estyjs.reset();
}

function pauseResume() {
	var running = estyjs.pauseResume();
	if (running) {
		document.querySelector("#btnPause span").innerHTML = "Pause";
	}
	else {
		document.querySelector("#btnPause span").innerHTML = "Resume";
	}
}


// What the picker accepts, for the message when it does not.
var READABLE_FILES = '.st, .msa, .stx, .zip and .sts';

function diskMessage(text, isProblem) {
	var el = document.querySelector('#diskmessage');
	if (el == null) return;
	el.textContent = text;
	el.className = isProblem ? 'problem' : '';
}

function showDrive(drive, inserted) {
	var img = document.querySelector(drive == 'B' ? '#floppy-2' : '#floppy-1');
	if (img != null) img.src = inserted ? 'img/floppy-active.png' : 'img/floppy-empty.png';
}

function extensionOf(name) {
	var dot = name.lastIndexOf('.');
	return (dot == -1) ? '' : name.substr(dot).toLowerCase();
}

function describeDisk(result) {
	return result.format + ', ' + result.tracks + ' tracks, ' +
	       (result.sides > 1 ? 'double sided' : 'single sided');
}

// A file counts as inserted once it has been read, which is after the picker
// has returned.
function diskLoaded(drive, name, result) {
	if (result && result.snapshot) {
		diskMessage('Loaded the snapshot in ' + name + '.', false);
		return;
	}

	if (result && result.ok) {
		showDrive(drive, true);
		diskMessage('Drive ' + drive + ': ' + name + ' (' + describeDisk(result) + ')', false);
	} else {
		showDrive(drive, false);
		diskMessage('Drive ' + drive + ' is empty: ' + name +
		            ' is not a disk image EstyJS can read.', true);
	}
}

function diskSelected(evt, drive) {
	var files = evt.target.files;

	//so that picking the same file twice is not ignored
	evt.target.value = '';

	if (files.length == 0) return;

	var file = files[0];
	var ext = extensionOf(file.name);

	function loaded(result) {
		diskLoaded(drive, file.name, result);
	}

	if (ext == '.sts') {
		estyjs.openSnapshotFile(file);
		diskMessage('Loaded the snapshot in ' + file.name + '.', false);
	} else if (ext == '.st' || ext == '.msa' || ext == '.stx') {
		estyjs.openFloppyFile(drive, file, loaded);
	} else if (ext == '.zip') {
		estyjs.openZipFile(drive, file, loaded);
	} else {
		//nothing was loaded, so the drive keeps what it had
		diskMessage('EstyJS cannot read ' + (ext == '' ? 'files without an extension' : ext + ' files') +
		            '. It reads ' + READABLE_FILES + '.', true);
	}
}

function tosSelected(evt) {
	var files = evt.target.files;

	evt.target.value = '';

	if (files.length == 0) return;

	var file = files[0];

	if (extensionOf(file.name) == '.img') {
		estyjs.changeTOS(file);
		diskMessage('Using the ROM in ' + file.name + '.', false);
	} else {
		diskMessage('A ROM has to be a .img file.', true);
	}
}

function fileSelected(evt) {
	diskSelected(evt, 'A');
}

function fileSelected2(evt) {
	diskSelected(evt, 'B');
}

function colorToggle() {
    estyjs.setMonoMonitor(!estyjs.getMonoMonitor());
    if (estyjs.getMonoMonitor()) {
        document.querySelector("#screen").style.backgroundImage = "url('img/sm124-bg.png')";
    } else {
        document.querySelector("#screen").style.backgroundImage = "url('img/sm124-sc-bg.png')";
        
    }
}

// Cursor keys and control are joystick 1 while this is on. The label says what
// a click does, like the other buttons.
var joystickEnabled = true;

function joystickToggle() {
	joystickEnabled = !joystickEnabled;
	estyjs.setJoystick(joystickEnabled);
	document.querySelector("#btnJoystick span").innerHTML =
		joystickEnabled ? "Joystick off" : "Joystick on";
}

function soundToggle() {
	var sound = estyjs.soundToggle();
	if (sound) {
		document.querySelector("#btnSound span").innerHTML = "Sound off";
	}
	else {
		document.querySelector("#btnSound span").innerHTML = "Sound on";
	}
}

function openFile(fname) {
    openFileInDrive(fname, 'A');
}

function openFileInDrive(fname,drive) {
	estyjs.openFloppyFile(drive, fname, function (result) {
		diskLoaded(drive, fname, result);
	});
}

function changeShowPct() {
    estyjs.setShowPct($('#showpct').prop('checked'));
}

function changeFrameskip() {
    estyjs.setFrameskip($('#frameskip').prop('checked'));
}


function changeRamSize() {
    estyjs.setMemory($('#ram').prop('checked'));
}

function lockMouse() {
    estyjs.lockMouse();
}

function mouseLocked() {
    var locked;
    if (estyjs==null) {
        locked = false;
    } else {
        locked = estyjs.getMouseLocked();
    }
    if (locked) {
        document.querySelector("#btnLocked span").innerHTML = "Unlock";
    }
    else {
        document.querySelector("#btnLocked span").innerHTML = "Lock";
    }
    setTimeout(mouseLocked, 250);

}

function fullScreen() {
        const elem = document.getElementById("EstyJsOutput");
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        }
}

function splashScreen(filename, callback) {
    const elem = document.getElementById("EstyJsOutput");
    const ctx = elem.getContext('2d');
    const img = new Image();
    img.src = filename; 
    ctx.fillStyle ="rgb(0 0 0)";
    img.onload = () => {
        var alpha = 0;
        var da = 0.01;
        function draw() {
            alpha += da;
            if (alpha > 1) {
                da = -da;
                alpha += da;
                return setTimeout(draw, 1000);
            }
            ctx.globalAlpha = 1;
            ctx.fillRect(0,0,elem.clientWidth, elem.clientHeight);
            var dx = (elem.clientWidth-img.width)/2;
            var dy = (elem.clientHeight-img.height)/2;
            ctx.globalAlpha = alpha
            if (alpha>0) {
                ctx.drawImage(img, dx, dy);
                requestAnimationFrame(draw);
            } else {
                setTimeout(callback, 1000);
            }
        }
        setTimeout(draw, 1000);
    }
}