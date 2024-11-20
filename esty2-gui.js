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
		$("#btnPause span").text("Pause");
	}
	else {
		$("#btnPause span").text("Resume");
	}
}

function fileSelected(evt) {
	var files = evt.target.files;
	if (files.length>0) {
		if (files[0].name.lastIndexOf('.')!=-1) {
			var ext = files[0].name.substr(files[0].name.lastIndexOf('.')).toLowerCase();
			if (ext == '.sts') {
			    estyjs.openSnapshotFile(files[0]);
			} else if (ext == '.st' || ext == '.msa') {
			    estyjs.openFloppyFile('A', files[0]);
			} else if (ext == '.zip') {
			    estyjs.openZipFile('A', files[0]);
			}
		}
	}
	
}

function fileSelected2(evt) {
    var files = evt.target.files;
    if (files.length > 0) {
        if (files[0].name.lastIndexOf('.') != -1) {
            var ext = files[0].name.substr(files[0].name.lastIndexOf('.')).toLowerCase();
            if (ext == '.sts') {
                estyjs.openSnapshotFile(files[0]);
            } else if (ext == '.st' || ext == '.msa') {
                estyjs.openFloppyFile('B', files[0]);
            } else if (ext == '.zip') {
                estyjs.openZipFile('B', files[0]);
            }
        }
    }

}

function soundToggle() {
	var sound = estyjs.soundToggle();
	if (sound) {
		$("#btnSound span").text("Turn sound off");
	}
	else {
		$("#btnSound span").text("Turn sound on");
	}
}

function openFile(fname) {
    estyjs.openFloppyFile('A', fname);
}

function openFileInDrive(fname,drive) {
	estyjs.openFloppyFile(drive, fname);
}

function openFile2() {
    estyjs.openSnapshotFile('rick_dangerous.sts');
}

function openFile3() {
	estyjs.openSnapshotFile('dmaster.sts');
}

function openFile4() {
    estyjs.openSnapshotFile('speedball2.sts');
}

function changeJoystick() {
	estyjs.setJoystick($('#joystick').prop('checked'));
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