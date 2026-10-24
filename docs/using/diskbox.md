# Disk box

Disks are kept in boxes in the browser, drawn as an open 3.5" disk box. Clicking drive A or B
takes the disk out of that drive and opens the box over the emulator. Into drive A or Into drive B
inserts the open disk and closes the box. Close box (or Escape) leaves the drive empty.

## Browsing

- Click a disk to open it. Click a divider to open its category.
- Mouse wheel and arrow keys browse.
- The label of the open disk is written on directly, up to 7 lines.
- A divider labels the disks behind it. Disks in front of the first divider are unsorted. The
  divider tipped forward shows the category of the open disk.
- Keys do not reach the ST while the box is open.

## Editing

- Add disk image: an `.st`, `.msa` or `.stx` file, or a `.zip` holding one. It becomes a new disk
  in front of the open one, labelled with the file name. An `.sts` file loads the Steem snapshot.
- Add divider: in front of the open disk.
- Remove: a divider, or a disk with its image. A disk in a drive stays.
- Label, label colour, case colour and write protection per disk. `.stx` disks are always write
  protected. Write protection changes when the disk is inserted next.
- A disk is in one drive at a time.
- Other box: Copy puts a second disk with the same image at the front of the other box, Move moves
  the disk there.
- New box, Delete box (with its disks), and the name of the box in the field next to the list.
- 60 slots per box. A divider takes one.

## Writing

What the ST writes to a disk goes back into the box when the drive light goes off, when the disk is
taken out, and when the page is hidden. A written `.msa` disk is stored as `.st` from then on.

A saved state keeps its own copy of the disks in the drives. Loading it takes the disks from the
box out first. A disk from a state stays apart from the box. Taken out after the ST wrote to it, it
goes into the box as a new disk.

## Storage

Boxes and disks are kept in IndexedDB together with the [saved states](states.md). An image used
by several disks or states is stored once.

Without WebGL2 or IndexedDB, clicking a drive opens the file picker and inserts the file directly.
A disk written then is lost on reload.
