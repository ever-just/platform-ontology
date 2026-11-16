import {
  Activity, BadgeCheck, BatteryMedium, Bell, Bluetooth, Cable, Camera, Clipboard, Clock, Coffee, Compass, Contact, Cookie,
  Cpu, CreditCard, Database, Eye, FileUp, Fingerprint, FolderOpen, Gamepad2, Gauge, Globe, HardDrive, Headphones, KeyRound, Keyboard,
  Languages, MapPin, Maximize, MemoryStick, MessageSquareText, Mic, Monitor, MonitorUp, Mouse, MousePointer2, Move3d, Nfc, Piano,
  Pipette, Rotate3d, ScanBarcode, Share2, Smartphone, Speech, Sun, Timer, Type, Usb, Vibrate, Wifi, Zap, Lock,
} from "lucide-react";
import type { AccessMode, DataLayer, IconType, ScopeDef } from "../core/types";

// Visual metadata for built in scopes: icon, access modes and data layer. Plugins set the same
// fields on their own ScopeDef; this table only fills fields a scope left empty.

type Meta = { icon: IconType; modes: Partial<Record<AccessMode, string>>; layer: DataLayer };

const M: Record<string, Meta> = {
  "place.geolocation": { icon: MapPin, layer: 3, modes: { detect: "Checks whether location is offered and already allowed.", stream: "Follows your position as it changes." } },
  "place.timezone": { icon: Clock, layer: 2, modes: { detect: "Reads your time zone and clock offset without asking." } },
  "place.compass": { icon: Compass, layer: 1, modes: { stream: "Streams which way the device points." } },
  "capture.camera": { icon: Camera, layer: 2, modes: { detect: "Counts cameras without turning one on.", stream: "Streams live video.", create: "Takes a still photo." } },
  "capture.microphone": { icon: Mic, layer: 2, modes: { detect: "Counts microphones without listening.", stream: "Streams live sound levels.", create: "Records a short clip." } },
  "capture.screen": { icon: MonitorUp, layer: 2, modes: { stream: "Streams the screen, window or tab you pick.", create: "Grabs a still frame of it." } },
  "capture.speech": { icon: MessageSquareText, layer: 2, modes: { stream: "Turns what you say into text, live." } },
  "capture.light": { icon: Sun, layer: 1, modes: { stream: "Streams how bright the room is." } },
  "capture.clipboard": { icon: Clipboard, layer: 2, modes: { detect: "Reads what you last copied.", create: "Writes text you choose into the clipboard." } },
  "motion.orientation": { icon: Rotate3d, layer: 2, modes: { stream: "Streams how the device is tilted." } },
  "motion.accelerometer": { icon: Move3d, layer: 2, modes: { stream: "Streams shakes, steps and movement." } },
  "motion.pointer": { icon: MousePointer2, layer: 2, modes: { stream: "Streams every pointer move and click." } },
  "motion.keystroke": { icon: Keyboard, layer: 3, modes: { stream: "Streams your typing rhythm, not the keys." } },
  "motion.attention": { icon: Eye, layer: 2, modes: { stream: "Streams whether you are looking at this tab." } },
  "device.battery": { icon: BatteryMedium, layer: 2, modes: { detect: "Reads charge and charging state.", stream: "Watches the battery drain or fill." } },
  "device.profile": { icon: Smartphone, layer: 2, modes: { detect: "Reads the device model, screen and system." } },
  "device.storage": { icon: HardDrive, layer: 1, modes: { detect: "Reads how much space this site may use." } },
  "device.pressure": { icon: Gauge, layer: 1, modes: { stream: "Streams how hard the processor is working." } },
  "device.screens": { icon: Monitor, layer: 2, modes: { detect: "Lists every screen and how they are arranged." } },
  "fingerprint.canvas": { icon: Fingerprint, layer: 3, modes: { detect: "Draws a hidden image and hashes the result." } },
  "fingerprint.fonts": { icon: Type, layer: 3, modes: { detect: "Works out which fonts are installed." } },
  "link.network": { icon: Wifi, layer: 2, modes: { detect: "Reads connection type and speed.", stream: "Watches the connection change." } },
  "link.timing": { icon: Timer, layer: 2, modes: { detect: "Times how long requests take to reach servers." } },
  "identity.passkeys": { icon: KeyRound, layer: 1, modes: { detect: "Checks which sign in methods this browser offers." } },
  "identity.contacts": { icon: Contact, layer: 2, modes: { detect: "Reads the contacts you pick from a list." } },
  "identity.storage_tracking": { icon: Cookie, layer: 3, modes: { detect: "Checks which storage could follow you across sites." } },
  "reach.wake_lock": { icon: Coffee, layer: 1, modes: { detect: "Checks whether the screen can be kept on.", stream: "Keeps the screen on while held." } },
  "surroundings.bluetooth": { icon: Bluetooth, layer: 2, modes: { detect: "Checks whether Bluetooth is on.", stream: "Watches nearby devices you allow." } },
  "surroundings.media_devices": { icon: Headphones, layer: 2, modes: { detect: "Lists cameras, microphones and speakers.", stream: "Watches devices plug in and out." } },
  "surroundings.usb": { icon: Usb, layer: 1, modes: { detect: "Reads the USB device you pick.", stream: "Talks to it while connected." } },
  "surroundings.serial": { icon: Cable, layer: 1, modes: { detect: "Reads the serial port you pick.", stream: "Reads and writes data on it." } },
  "surroundings.hid": { icon: Mouse, layer: 1, modes: { detect: "Reads the input device you pick.", stream: "Streams its reports." } },
  "surroundings.midi": { icon: Piano, layer: 1, modes: { detect: "Lists instruments plugged in.", stream: "Streams notes as you play." } },
  "surroundings.gamepad": { icon: Gamepad2, layer: 1, modes: { stream: "Streams sticks and buttons." } },
  "surroundings.nfc": { icon: Nfc, layer: 1, modes: { stream: "Reads tags you tap." } },
};

// Generated scopes are matched by words in their name.
const BY_NAME: [RegExp, IconType, Partial<Record<AccessMode, string>>, DataLayer][] = [
  [/notification/i, Bell, { detect: "Checks whether notifications are allowed.", create: "Shows a notification." }, 1],
  [/vibrat/i, Vibrate, { create: "Buzzes the device in a pattern." }, 1],
  [/fullscreen/i, Maximize, { create: "Fills the screen with this page." }, 1],
  [/share/i, Share2, { create: "Opens the share sheet with content." }, 1],
  [/file picker/i, FileUp, { create: "Opens a file you pick." }, 2],
  [/folder/i, FolderOpen, { create: "Opens a folder you pick." }, 2],
  [/colour picker/i, Pipette, { create: "Picks a colour from anywhere on screen." }, 1],
  [/keep my data/i, Database, { detect: "Asks to keep site data from being cleared." }, 1],
  [/payment/i, CreditCard, { detect: "Checks which payment methods are ready." }, 2],
  [/passkey/i, KeyRound, { detect: "Checks passkey support." }, 1],
  [/voices/i, Speech, { detect: "Lists the speaking voices installed." }, 3],
  [/copy to clipboard/i, Clipboard, { create: "Writes text into the clipboard." }, 1],
  [/mouse capture/i, Lock, { stream: "Locks the pointer and streams raw movement." }, 1],
  [/badge/i, BadgeCheck, { create: "Puts a count on the app icon." }, 1],
  [/keyboard layout/i, Languages, { detect: "Reads your keyboard layout." }, 3],
  [/graphics|webgpu/i, Zap, { detect: "Reads the graphics chip." }, 3],
  [/refresh rate/i, Monitor, { detect: "Measures how often the screen redraws." }, 2],
  [/processor|cpu/i, Cpu, { detect: "Measures processor speed and core count." }, 2],
  [/memory/i, MemoryStick, { detect: "Reads browser memory limits." }, 2],
  [/barcode/i, ScanBarcode, { detect: "Checks which barcodes can be read." }, 1],
  [/idle/i, Activity, { stream: "Watches whether you are at the device." }, 2],
  [/speech recognition/i, MessageSquareText, { stream: "Turns speech into text." }, 2],
  [/location/i, MapPin, { detect: "Reads your position once." }, 3],
  [/camera/i, Camera, { stream: "Streams live video.", create: "Takes a still photo." }, 2],
  [/microphone/i, Mic, { stream: "Streams live sound." }, 2],
  [/screen/i, MonitorUp, { stream: "Streams the screen you pick." }, 2],
  [/bluetooth/i, Bluetooth, { detect: "Reads the device you pick." }, 2],
  [/usb/i, Usb, { detect: "Reads the device you pick." }, 1],
  [/serial/i, Cable, { detect: "Reads the port you pick." }, 1],
  [/hid/i, Mouse, { detect: "Reads the device you pick." }, 1],
  [/midi/i, Piano, { detect: "Lists instruments." }, 1],
  [/fonts/i, Type, { detect: "Lists installed fonts." }, 3],
  [/controller|gamepad/i, Gamepad2, { detect: "Lists connected controllers." }, 1],
  [/storage/i, HardDrive, { detect: "Reads storage space." }, 1],
  [/battery/i, BatteryMedium, { detect: "Reads charge." }, 2],
  [/network/i, Wifi, { detect: "Reads the connection." }, 2],
  [/tilt|motion/i, Rotate3d, { stream: "Streams tilt and motion." }, 2],
  [/contact/i, Contact, { detect: "Reads contacts you pick." }, 2],
  [/device list/i, Headphones, { detect: "Lists media devices." }, 2],
  [/awake/i, Coffee, { stream: "Keeps the screen on." }, 1],
];

/** Fill icon, modes and layer on scopes that did not set them. */
export function applyMeta(scopes: ScopeDef[]): ScopeDef[] {
  return scopes.map((s) => {
    if (s.icon && s.modes && s.layer) return s;
    const m = M[s.id];
    const n = m ? null : BY_NAME.find(([re]) => re.test(s.name));
    return {
      ...s,
      icon: s.icon ?? m?.icon ?? n?.[1] ?? Globe,
      modes: s.modes ?? m?.modes ?? n?.[2] ?? { detect: "Reads a value once." },
      layer: s.layer ?? m?.layer ?? n?.[3] ?? 1,
    };
  });
}

