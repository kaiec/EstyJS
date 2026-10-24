# Saved states

Save state keeps the whole machine in the browser: RAM, processor and chips, the disks in both
drives as they are at that moment (written sectors included), the ROM and a picture of the screen.
Load state opens the panel listing the saved states, newest first. Load continues the machine where
it was saved.

- A new state takes the name of the state last loaded or saved, renames included. Without one, it
  takes the file name of the disk in drive A. Click the name to change it.
- Loading puts the saved disks into the drives and the saved ROM into the machine.
- Keys, mouse buttons and joystick directions held while saving are released after loading.
- A disk or ROM used by several states is stored once.
- A state saved by another version of EstyJS is listed and cannot be loaded.

Not in a state:

- The settings of the page: sound, joystick switch, mouse lock.
- Tone and envelope phase of the sound chip. Sound continues from the register values.

## Storage

The states are kept in IndexedDB, per site. On the first save EstyJS asks the browser to keep the
storage (`navigator.storage.persist`). Safari may still delete it after 7 days without a visit, and
a private window loses it when closed. Export keeps states safe. "Storage in use" is what the
browser counts for the whole site.

Export writes one state as a ZIP, Export all writes all of them. Import adds the states in such a
ZIP, in the same or another browser. The ZIP holds:

```text
states.json         {version, states: [{name, created, format, machine, rom, drives, thumbnail}]}
blobs/<sha-256>     machine state, ROM and disk images, named by their hash
thumbnails/<n>.png
```
