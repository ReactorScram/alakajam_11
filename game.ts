declare let TileMaps: Object;
const map = TileMaps ["map_2"].layers [0];
const map_width: number = map.width;
const map_data = new Uint8Array (window.atob (map.data).split("").map(function(c) {
    return c.charCodeAt(0); 
}));


const canvas_element = <HTMLCanvasElement> document.getElementById ("QR4YH2UP");
const ctx = canvas_element.getContext ('2d')!;

function resize_canvas (width: number, height: number){
	canvas_element.width = width;
	canvas_element.height = height;
	
	draw (game_state);
}

let raf_id: number | null = null;
let last_ms: number | null = null;
let throbber_frame: number = 0;
let fps_num: number = 60;
let fps_den: number = 1000;
let timestep_accum: number = fps_den / 2;

const map_left: number = 50;
const map_right: number = 720;
const lara_y: number = 334;
const kristie_y: number = 203;

const kristie_speed: number = 2.0;
const lara_speed: number = 4.0;

let last_entity = 0;

function create_entity () {
	last_entity += 1;
	return last_entity;
}

class PosComponent {
	x: number;
	y: number;
	
	constructor (x: number, y: number) {
		this.x = x;
		this.y = y;
	}
	
	dist2 (o: PosComponent): number {
		const diff_x = this.x - o.x;
		const diff_y = this.y - o.y;
		
		return diff_x * diff_x + diff_y * diff_y;
	}
}

class SpriteComponent {
	name: string;
	offset_x: number;
	offset_y: number;
	
	constructor (name: string, offset_x: number, offset_y: number) {
		this.name = name;
		this.offset_x = offset_x;
		this.offset_y = offset_y;
	}
}

class DoorComponent {
	open: boolean;
	
	constructor (open: boolean) {
		this.open = open;
	}
}

class ButtonComponent {
	door: number;
	
	constructor (door: number) {
		this.door = door;
	}
}

class SnakeComponent {
	held_by: number | null;
	
	constructor () {
		this.held_by = null;
	}
}

class HolderComponent {
	holding: number | null;
	
	constructor () {
		this.holding = null;
	}
}

class GameState {
	frame_count: number;
	
	lara: number;
	kristie: number;
	
	positions: Map <number, PosComponent>;
	sprites: Map <number, SpriteComponent>;
	buttons: Map <number, ButtonComponent>;
	doors: Map <number, DoorComponent>;
	snakes: Map <number, SnakeComponent>;
	holders: Map <number, HolderComponent>;
	
	constructor () {
		this.frame_count = 0;
		
		this.positions = new Map ();
		this.sprites = new Map ();
		this.buttons = new Map ();
		this.doors = new Map ();
		this.snakes = new Map ();
		this.holders = new Map ();
		
		{
			let d = create_entity ();
			this.positions.set (d, new PosComponent (200.0, lara_y));
			this.sprites.set (d, new SpriteComponent ("placeholder-door", -32 / 2, -32 / 2));
			this.doors.set (d, new DoorComponent (false));
			
			let b = create_entity ();
			this.positions.set (b, new PosComponent (200.0, kristie_y));
			this.sprites.set (b, new SpriteComponent ("placeholder-button", -32 / 2, -32 / 2));
			this.buttons.set (b, new ButtonComponent (d));
		}
		
		{
			let d = create_entity ();
			this.positions.set (d, new PosComponent (400.0, lara_y));
			this.sprites.set (d, new SpriteComponent ("placeholder-door", -32 / 2, -32 / 2));
			this.doors.set (d, new DoorComponent (false));
			
			let b = create_entity ();
			this.positions.set (b, new PosComponent (400.0, kristie_y));
			this.sprites.set (b, new SpriteComponent ("placeholder-button", -32 / 2, -32 / 2));
			this.buttons.set (b, new ButtonComponent (d));
		}
		
		{
			let d = create_entity ();
			this.positions.set (d, new PosComponent (600.0, lara_y));
			this.sprites.set (d, new SpriteComponent ("placeholder-door", -32 / 2, -32 / 2));
			this.doors.set (d, new DoorComponent (false));
			
			let b = create_entity ();
			this.positions.set (b, new PosComponent (600.0, kristie_y));
			this.sprites.set (b, new SpriteComponent ("placeholder-button", -32 / 2, -32 / 2));
			this.buttons.set (b, new ButtonComponent (d));
		}
		
		{
			let e = create_entity ();
			this.positions.set (e, new PosComponent (map_left, lara_y));
			this.sprites.set (e, new SpriteComponent ("placeholder-person", -32 / 2, -32 / 2));
			this.lara = e;
		}
		
		{
			let e = create_entity ();
			this.positions.set (e, new PosComponent (32 + 16, 32 + 16));
			this.sprites.set (e, new SpriteComponent ("placeholder-person", -32 / 2, -32 / 2));
			this.holders.set (e, new HolderComponent ());
			this.kristie = e;
		}
		
		{
			let e = create_entity ();
			this.positions.set (e, new PosComponent (400, 100));
			this.sprites.set (e, new SpriteComponent ("snake", -32 / 2, -32 / 2));
			this.snakes.set (e, new SnakeComponent ());
		}
	}
	
	nearest_entity (actor: number, map: Map <number, any>, radius: number): number | null {
		const actor_pos = this.positions.get (actor)!;
		
		let nearest: number | null = null;
		let nearest_dist2: number | null = null;
		
		for (const [entity, button] of map) {
			const pos = this.positions.get (entity);
			if (! pos) {
				continue;
			}
			
			const dist2 = actor_pos.dist2 (pos);
			if (dist2 >= radius * radius) {
				continue;
			}
			
			if (nearest_dist2 == null) {
				nearest_dist2 = dist2;
				nearest = entity;
			}
			else if (dist2 < nearest_dist2) {
				nearest_dist2 = dist2;
				nearest = entity;
			}
		}
		
		return nearest;
	}
	
	try_toggle_button (actor: number): boolean {
		const nearest_button = this.nearest_entity (actor, this.buttons, 32);
		if (typeof (nearest_button) != "number") {
			return false;
		}
		
		const button = this.buttons.get (nearest_button);
		if (! button) {
			return false;
		}
		
		const door = this.doors.get (button.door);
		if (! door) {
			return false;
		}
		
		door.open = true;
		return true;
	}
	
	try_pick_snake (actor: number): boolean {
		const holder = this.holders.get (actor);
		if (! holder) {
			return false;
		}
		if (holder.holding != null) {
			return false;
		}
		
		const nearest_snake = this.nearest_entity (actor, this.snakes, 32);
		if (typeof (nearest_snake) != "number") {
			return false;
		}
		
		const snake = this.snakes.get (nearest_snake);
		if (! snake) {
			return false;
		}
		
		snake.held_by = actor;
		holder.holding = nearest_snake;
		
		return true;
	}
	
	try_drop_snake (actor: number): boolean {
		const holder = this.holders.get (actor);
		if (! holder) {
			return false;
		}
		if (holder.holding == null) {
			return false;
		}
		
		const snake = this.snakes.get (holder.holding);
		if (! snake) {
			return false;
		}
		
		snake.held_by = null;
		holder.holding = null;
		
		return true;
	}
	
	pos_is_walkable (x: number, y: number): boolean {
		const tile_x = Math.floor (x / 32);
		const tile_y = Math.floor (y / 32);
		const tile_index = tile_y * map_width + tile_x;
		
		return map_data [tile_index * 4] == 2;
	}
	
	step (cow_gamepad: CowGamepad) {
		this.frame_count += 1;
		
		const kristie_pos = this.positions.get (this.kristie)!;
		
		const move_vec = cow_gamepad.move_vec ();
		
		const kristie_new_x = kristie_pos.x + kristie_speed * move_vec [0];
		const kristie_new_y = kristie_pos.y + kristie_speed * move_vec [1];
		
		if (this.pos_is_walkable (kristie_new_x, kristie_new_y)) {
			this.sprites.get (this.kristie)!.name = "placeholder-person-glowing";
			
			kristie_pos.x = kristie_new_x;
			kristie_pos.y = kristie_new_y;
		}
		else {
			this.sprites.get (this.kristie)!.name = "placeholder-person";
		}
		
		let leftest_door: number | null = null;
		for (const [entity, door] of this.doors) {
			if (door.open) {
				continue;
			}
			
			const pos = this.positions.get (entity);
			if (! pos) {
				continue;
			}
			
			if (leftest_door === null) {
				leftest_door = entity;
			}
			else if (pos.x < this.positions.get (leftest_door)!.x) {
				leftest_door = entity;
			}
		}
		
		let lara_max_x = map_right;
		if (leftest_door != null) {
			lara_max_x = this.positions.get (leftest_door)!.x - 32;
		}
		
		const lara_pos = this.positions.get (this.lara)!;
		lara_pos.x = Math.min (lara_max_x, lara_pos.x + lara_speed);
		
		if (cow_gamepad.action_x.just_pressed) {
			if (this.try_drop_snake (this.kristie)) {
				console.log ("Dropped snake.");
			}
			else if (this.try_toggle_button (this.kristie)) {
				
			}
			else if (this.try_pick_snake (this.kristie)) {
				console.log ("Picked up snake.");
			}
			else {
				console.log ("No action here!");
			}
		}
		
		for (const [entity, snake] of this.snakes) {
			if (typeof (snake.held_by) != "number") {
				continue;
			}
			
			// Beauty is in the pos of the snake holder
			
			const holder_pos = this.positions.get (snake.held_by);
			if (! holder_pos) {
				continue;
			}
			
			const snake_pos = this.positions.get (entity);
			if (! snake_pos) {
				continue;
			}
			
			snake_pos.x = holder_pos.x + 32;
			snake_pos.y = holder_pos.y;
		}
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
	
	move_vec (): number [] {
		let x = 0.0;
		let y = 0.0;
		
		if (this.d_left.down_or_just_pressed ()) {
			x -= 1.0;
		}
		if (this.d_right.down_or_just_pressed ()) {
			x += 1.0;
		}
		if (this.d_up.down_or_just_pressed ()) {
			y -= 1.0;
		}
		if (this.d_down.down_or_just_pressed ()) {
			y += 1.0;
		}
		
		const dist2 = x * x + y * y;
		
		if (dist2 > 1.0) {
			const dist = Math.sqrt (dist2);
			x = x / dist;
			y = y / dist;
		}
		
		return [x, y];
	}
	
	decode (code: string): CowKey | null {
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
		else if (code == "Space") {
			return this.action_x;
		}
		else {
			console.log ("Unknown keycode " + code);
			return null;
		}
	}
	
	keydown (code: string) {
		const key = this.decode (code);
		if (key != null) {
			key.keydown ();
		}
	}
	
	keyup (code: string) {
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
	
	// Tile map
	
	for (let y = 0; y < 32; y++) {
		for (let x = 0; x < map_width; x++) {
			const index = y * map_width + x;
			const tile = map_data [index * 4];
			
			if (tile == 2) {
				draw_sprite ("placeholder-open-tile", x * 32, y * 32);
			}
		}
	}
	
	// Sprites from the ECS
	
	for (const [entity, sprite] of game_state.sprites) {
		const pos: PosComponent = game_state.positions.get (entity)!;
		
		if (pos == null) {
			return;
		}
		
		draw_sprite (sprite.name, Math.floor (pos.x + sprite.offset_x), Math.floor (pos.y + sprite.offset_y));
	}
	
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
	draw (game_state);
}

draw (game_state);
set_running (false);

const sprite_names: string [] = [
	"placeholder-button",
	"placeholder-closed-tile",
	"placeholder-door",
	"placeholder-map",
	"placeholder-open-tile",
	"placeholder-person",
	"placeholder-person-glowing",
	"snake",
];

for (const name of sprite_names) {
	const img = new Image ();
	img.src = "assets/png/" + name + ".png";
	img.decode ()
	.then (() => {
		createImageBitmap (img)
		.then ((value) => {
			sprites [name] = value;
			draw (game_state);
		});
	});
}

