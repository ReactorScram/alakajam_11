const canvas_element = <HTMLCanvasElement> document.getElementById ("QR4YH2UP");
const ctx = canvas_element.getContext ('2d');

function resize_canvas (width: number, height: number){
	canvas_element.width = width;
	canvas_element.height = height;
	
	draw (game_state);
}

let raf_id: number = null;
let last_ms: number = null;
let throbber_frame: number = 0;
let fps_num: number = 60;
let fps_den: number = 1000;
let timestep_accum: number = fps_den / 2;

const map_left: number = 50;
const map_right: number = 720;
const lara_y: number = 203;
const kristie_y: number = 334;

const kristie_speed: number = 2.0;

class GameState {
	frame_count: number;
	
	kristie_x: number;
	
	constructor () {
		this.frame_count = 0;
		this.kristie_x = map_right;
	}
	
	step (cow_gamepad: CowGamepad) {
		this.frame_count += 1;
		
		if (cow_gamepad.d_left.down_or_just_pressed ()) {
			this.kristie_x -= kristie_speed;
		}
		if (cow_gamepad.d_right.down_or_just_pressed ()) {
			this.kristie_x += kristie_speed;
		}
		
		this.kristie_x = Math.min (Math.max (this.kristie_x, map_left), map_right);
	}
}

let game_state = new GameState ();

let running: boolean = false;

let sprites: Map <string, ImageBitmap> = new Map ();

function get_sprite (name: string): ImageBitmap {
	return sprites [name];
}

class CowKey {
	down: boolean;
	just_pressed: boolean;
	
	constructor () {
		this.down = false;
		this.just_pressed = false;
	}
	
	down_or_just_pressed (): boolean {
		return this.down || this.just_pressed;
	}
	
	keydown () {
		this.just_pressed = true;
		this.down = true;
	}
	
	keyup () {
		this.down = false;
	}
	
	tick () {
		this.just_pressed = false;
	}
}

class CowGamepad {
	d_left: CowKey;
	d_right: CowKey;
	d_up: CowKey;
	d_down: CowKey;
	
	action_x: CowKey;
	
	constructor () {
		this.clear ();
	}
	
	clear () {
		this.d_left = new CowKey ();
		this.d_right = new CowKey ();
		this.d_up = new CowKey ();
		this.d_down = new CowKey ();
		this.action_x = new CowKey ();
	}
	
	decode (code: String): CowKey {
		if (code == "ArrowDown") {
			return this.d_down;
		}
		else if (code == "ArrowUp") {
			return this.d_up;
		}
		if (code == "ArrowLeft") {
			return this.d_left;
		}
		else if (code == "ArrowRight") {
			return this.d_right;
		}
		else if (code == "KeyX") {
			return this.action_x;
		}
		else {
			return null;
		}
	}
	
	keydown (code: String) {
		const key = this.decode (code);
		if (key != null) {
			key.keydown ();
		}
	}
	
	keyup (code: String) {
		const key = this.decode (code);
		if (key != null) {
			key.keyup ();
		}
	}
	
	tick () {
		this.d_left.tick ();
		this.d_right.tick ();
		this.d_up.tick ();
		this.d_down.tick ();
		this.action_x.tick ();
	}
}

let cow_gamepad = new CowGamepad ();

canvas_element.addEventListener ("keydown", event => {
	if (event.isComposing || event.keyCode === 229) {
		return;
	}
	
	console.log ("keydown " + String ());
	cow_gamepad.keydown (event.code);
	
	event.preventDefault ();
});

canvas_element.addEventListener ("keyup", event => {
	if (event.isComposing || event.keyCode === 229) {
		return;
	}
	
	cow_gamepad.keyup (event.code);
	
	event.preventDefault ();
});

canvas_element.addEventListener ("blur", event => {
	cow_gamepad.clear ();
	pause ();
});

canvas_element.addEventListener ("focus", event => {
	cow_gamepad.clear ();
	play ();
});

function fixed_step () {
	if (throbber_frame == 0) {
		throbber_frame = 1;
	}
	else {
		throbber_frame = 0;
	}
	
	game_state.step (cow_gamepad);
	
	cow_gamepad.tick ();
}

function draw (game_state: GameState) {
	const scale: number = canvas_element.width / 800;
	
	ctx.resetTransform ();
	ctx.scale (scale, scale);
	
	function draw_sprite (name, x, y) {
		const s = get_sprite (name);
		if (s != null) {
			ctx.drawImage (s, x, y);
		}
	}
	
	// Background
	
	draw_sprite ("placeholder-map", 0, 0);
	
	// Sprites in painter's order
	
	draw_sprite ("placeholder-person", map_left - 32 / 2, lara_y - 32 / 2);
	draw_sprite ("placeholder-person", game_state.kristie_x - 32 / 2, kristie_y - 32 / 2);
	
	// UI
	
	ctx.fillStyle ="#000";
	
	if (throbber_frame == 0) {
		ctx.fillRect(5, 5, 10, 10);
	}
	else {
		ctx.fillRect(15, 5, 10, 10);
	}
	
	if (! running) {
		ctx.fillStyle = "#000";
		ctx.fillRect (800 / 2 - 150 / 2, 600 / 2 - 50 / 2, 150, 50);
		
		ctx.fillStyle = "#fff";
		ctx.textAlign = "center";
		ctx.fillText ("Click to resume", 800 / 2, 600 / 2);
	}
}

function cancel_raf () {
	timestep_accum = fps_den / 2;
	last_ms = null;
	if (raf_id != null) {
		window.cancelAnimationFrame (raf_id);
		raf_id = null;
	}
}

function step (now_ms: number) {
	if (last_ms == null) {
		last_ms = now_ms;
	}
	
	let delta_ms = now_ms - last_ms;
	timestep_accum += delta_ms * fps_num;
	let logic_steps = 0;
	while (timestep_accum >= fps_den) {
		logic_steps += 1;
		timestep_accum -= fps_den;
	}
	if (logic_steps > 3) {
		logic_steps = 0;
	}
	last_ms = now_ms;
	
	for (let i = 0; i < logic_steps; i++) {
		fixed_step ();
	}
	
	draw (game_state);
	
	if (running) {
		raf_id = window.requestAnimationFrame (step);
	}
}

function set_running (b: boolean) {
	running = b;
	(<HTMLInputElement> document.getElementById ("SLPOFAAK")).disabled =   running;
	(<HTMLInputElement> document.getElementById ("HCNSQXRP")).disabled = ! running;
}

function play () {
	canvas_element.focus ();
	set_running (true);
	cancel_raf ();
	raf_id = window.requestAnimationFrame (step);
}

function pause () {
	set_running (false);
	step (null);
}

step (null);
set_running (false);

const sprite_names: string [] = [
	"placeholder-map",
	"placeholder-person",
];

for (const name of sprite_names) {
	const img = new Image ();
	img.src = "assets/png/" + name + ".png";
	img.decode ()
	.then (() => {
		createImageBitmap (img)
		.then ((value) => {
			sprites [name] = value;
			step (null);
		});
	});
}

