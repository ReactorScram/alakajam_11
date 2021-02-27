declare let TileMaps: Object;

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

class TileInfo {
	sprite: string = "";
	lara_can_walk: boolean = false;
	kristie_can_walk: boolean = false;
	is_goal: boolean = false;
	
	constructor (n: number) {
		if (n == 2) {
			this.sprite = "tile-ruins";
			this.lara_can_walk = true;
			this.kristie_can_walk = true;
		}
		else if (n == 3) {
			this.sprite = "cup";
			this.lara_can_walk = true;
			this.kristie_can_walk = true;
			this.is_goal = true;
		}
		else if (n == 4) {
			this.sprite = "door-staff";
			this.kristie_can_walk = true;
		}
		else if (n == 5) {
			this.sprite = "tile-backrooms";
			this.kristie_can_walk = true;
		}
		else if (n == 6) {
			// Door
			this.sprite = "tile-ruins";
			this.lara_can_walk = true;
			this.kristie_can_walk = true;
		}
		else if (n == 7) {
			this.sprite = "tile-ruins-crud";
			this.lara_can_walk = true;
			this.kristie_can_walk = true;
		}
	}
}

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
	
	clone (): PosComponent {
		return new PosComponent (this.x, this.y);
	}
	
	dist2 (o: PosComponent): number {
		const diff_x = this.x - o.x;
		const diff_y = this.y - o.y;
		
		return diff_x * diff_x + diff_y * diff_y;
	}
}

class SpriteComponent {
	name: string | null;
	name_func: (() => string | null) | null = null;
	
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

interface Ecs {
	map_width: number;
	
	doors: Map <number, DoorComponent>;
	holders: Map <number, HolderComponent>;
	laras: Map <number, LaraComponent>;
	positions: Map <number, PosComponent>;
	sprites: Map <number, SpriteComponent>;
	snakes: Map <number, SnakeComponent>;
	
	goal_map: Map <number, number>;
	
	nearest_entity (actor: number, map: Map <number, any>, radius: number): number | null;
}

class SnakeComponent {
	held_by: number | null;
	anim_timer: number = 0;
	alive: boolean = true;
	
	constructor () {
		this.held_by = null;
	}
	
	step_held (ecs: Ecs, entity: number) {
		const held_by = this.held_by;
		if (typeof (held_by) != "number") {
			return;
		}
		
		const holder_pos = ecs.positions.get (held_by);
		if (! holder_pos) {
			return;
		}
		
		const holder = ecs.holders.get (held_by);
		if (! holder) {
			return;
		}
		
		const snake_pos = ecs.positions.get (entity);
		if (! snake_pos) {
			return;
		}
		
		const snake_sprite = ecs.sprites.get (entity);
		if (! snake_sprite) {
			return;
		}
		
		snake_sprite.name = "snake-1";
		this.anim_timer = 0;
		
		const hold_dist = 16;
		
		snake_pos.x = holder_pos.x + holder.dir_x * hold_dist;
		snake_pos.y = holder_pos.y + holder.dir_y * hold_dist;
	}
	
	step_free (ecs: Ecs, entity: number) {
		const snake_pos = ecs.positions.get (entity);
		if (! snake_pos) {
			return;
		}
		
		const snake_sprite = ecs.sprites.get (entity);
		if (! snake_sprite) {
			return;
		}
		
		const lara = ecs.nearest_entity (entity, ecs.laras, 5 * 32);
		if (typeof (lara) != "number") {
			return;
		}
		
		const lara_pos = ecs.positions.get (lara);
		if (! lara_pos) {
			return;
		}
		
		if (snake_pos.dist2 (lara_pos) >= Math.pow (5 * 32, 2)) {
			return;
		}
		
		if (lara_pos.x < snake_pos.x) {
			const snake_speed: number = 0.5;
			
			snake_pos.x -= snake_speed;
			
			this.anim_timer -= 1;
			if (this.anim_timer <= 0) {
				this.anim_timer = 60;
			}
			
			if (this.anim_timer >= 30) {
				snake_sprite.name = "snake-2";
			}
			else {
				snake_sprite.name = "snake-1";
			}
		}
		else {
			snake_sprite.name = "snake-1";
			this.anim_timer = 0;
		}
	}
	
	fixed_step (ecs: Ecs, entity: number) {
		if (this.held_by === null) {
			this.step_free (ecs, entity);
		}
		else {
			this.step_held (ecs, entity);
		}
	}
}

class SnakeSpawnerComponent {
	timer: number = 1000;
	
	fixed_step (ecs: Ecs, entity: number) {
		const spawner_pos = ecs.positions.get (entity);
		if (! spawner_pos) {
			return;
		}
		
		const nearest_snake = ecs.nearest_entity (entity, ecs.snakes, 32);
		if (! nearest_snake) {
			this.timer += 1;
			if (this.timer >= 120 && ecs.snakes.size < 10) {
				let snake = create_entity ();
				ecs.positions.set (snake, spawner_pos.clone ());
				ecs.sprites.set (snake, new SpriteComponent ("snake-1", -32 / 2, -32 / 2));
				ecs.snakes.set (snake, new SnakeComponent ());
			}
		}
		else {
			this.timer = 0;
		}
	}
}

class LaraComponent {
	fixed_step (ecs: Ecs, entity: number) {
		const lara_pos = ecs.positions.get (entity)!;
		
		const tile_x = Math.floor (lara_pos.x / 32);
		const tile_y = Math.floor (lara_pos.y / 32);
		const index_me = tile_y * ecs.map_width + tile_x;
		const dist_me = ecs.goal_map.get (index_me)!;
		
		const neighbors = [
			[tile_x - 1, tile_y    ],
			[tile_x + 1, tile_y    ],
			[tile_x    , tile_y - 1],
			[tile_x    , tile_y + 1],
		];
		
		let best_dist = dist_me;
		let best_direction = [0, 0];
		
		// Check for doors blocking our path
		
		let blocked_tiles: Map <number, number> = new Map ();
		for (const [door_e, door] of ecs.doors) {
			if (! door.open) {
				const pos = ecs.positions.get (door_e)!;
				const x = Math.floor (pos.x / 32);
				const y = Math.floor (pos.y / 32);
				const index = y * ecs.map_width + x;
				
				blocked_tiles.set (index, door_e);
			}
		}
		
		for (const [snake_e, snake] of ecs.snakes) {
			if (snake.alive) {
				const pos = ecs.positions.get (snake_e)!;
				const x = Math.floor (pos.x / 32);
				const y = Math.floor (pos.y / 32);
				const index = y * ecs.map_width + x;
				
				blocked_tiles.set (index, snake_e);
			}
		}
		
		for (const [n_x, n_y] of neighbors) {
			const index_nay = n_y * ecs.map_width + n_x;
			const dist_nay = ecs.goal_map.get (index_nay);
			
			if (typeof (dist_nay) != "number") {
				continue;
			}
			
			if (typeof (blocked_tiles.get (index_nay)) == "number") {
				continue;
			}
			
			if (dist_nay < best_dist) {
				best_dist = dist_nay;
				best_direction = [n_x - tile_x, n_y - tile_y];
			}
		}
		
		const intra_x = lara_pos.x - tile_x * 32;
		const intra_y = lara_pos.y - tile_y * 32;
		
		let move_vec = [best_direction [0], best_direction [1]];
		
		const corner_margin = 12;
		
		if (best_direction [0] == 0) {
			if (intra_x < corner_margin) {
				move_vec [0] = 1;
			}
			else if (intra_x > 32 - corner_margin) {
				move_vec [0] = -1;
			}
		}
		if (best_direction [1] == 0) {
			if (intra_y < corner_margin) {
				move_vec [1] = 1;
			}
			else if (intra_y > 32 - corner_margin) {
				move_vec [1] = -1;
			}
		}
		
		const move_dist2 = move_vec [0] * move_vec [0] + move_vec [1] * move_vec [1];
		if (move_dist2 > 0) {
			const move_dist = Math.sqrt (move_dist2);
			move_vec = [move_vec [0] / move_dist, move_vec [1] / move_dist];
			
			const lara_speed: number = 2.0;
			
			lara_pos.x += move_vec [0] * lara_speed;
			lara_pos.y += move_vec [1] * lara_speed;
		}
	}
}

class HolderComponent {
	holding: number | null;
	dir_x: number;
	dir_y: number;
	
	constructor () {
		this.holding = null;
	}
}

class LevelState {
	map_width: number = 1;
	map_data: Uint8Array;
	
	// Fixed root entities
	
	kristie: number;
	
	buttons: Map <number, ButtonComponent>;
	doors: Map <number, DoorComponent>;
	holders: Map <number, HolderComponent>;
	laras: Map <number, LaraComponent>;
	positions: Map <number, PosComponent>;
	snakes: Map <number, SnakeComponent>;
	snake_spawners: Map <number, SnakeSpawnerComponent>;
	sprites: Map <number, SpriteComponent>;
	
	goal_map: Map <number, number>;
	
	constructor (map) {
		this.map_width = map.width;
		this.map_data = new Uint8Array (window.atob (map.data).split("").map(function(c) {
			return c.charCodeAt(0); 
		}));
		
		this.buttons = new Map ();
		this.doors = new Map ();
		this.holders = new Map ();
		this.laras = new Map ();
		this.positions = new Map ();
		this.snakes = new Map ();
		this.snake_spawners = new Map ();
		this.sprites = new Map ();
		
		const map_objects = TileMaps ["map_2"].layers [1];
		
		// From Tiled ID to game ID
		
		const id_map: Map <number, number> = new Map ();
		
		// Create all objects
		
		for (const obj of map_objects.objects) {
			const tiled_id = obj ["id"];
			const x = obj ["x"];
			const y = obj ["y"];
			const tiled_type = obj ["type"];
			
			const e = create_entity ();
			const pos = new PosComponent (x, y);
			
			if (tiled_type == "door") {
				this.positions.set (e, pos);
				this.sprites.set (e, new SpriteComponent ("placeholder-door", -32 / 2, -32 / 2));
				this.doors.set (e, new DoorComponent (false));
			}
			else if (tiled_type == "button") {
				this.positions.set (e, pos);
				this.sprites.set (e, new SpriteComponent ("placeholder-button", -32 / 2, -32 / 2));
			}
			else if (tiled_type == "spawn_lara") {
				this.positions.set (e, pos);
				this.sprites.set (e, new SpriteComponent ("lara", -32 / 2, -32 / 2));
				this.laras.set (e, new LaraComponent ());
			}
			else if (tiled_type == "spawn_kristie") {
				this.positions.set (e, pos);
				this.sprites.set (e, new SpriteComponent ("kristie", -32 / 2, -32 / 2));
				this.holders.set (e, new HolderComponent ());
				this.kristie = e;
			}
			else if (tiled_type == "spawn_snakes") {
				this.positions.set (e, pos);
				this.snake_spawners.set (e, new SnakeSpawnerComponent ());
				this.snake_spawners.get (e)!.fixed_step (this, e);
			}
			
			id_map.set (tiled_id, e);
		}
		
		// Link up objects using id_map
		
		for (const obj of map_objects.objects) {
			const tiled_id = obj ["id"];
			const tiled_type = obj ["type"];
			const game_id = id_map.get (tiled_id);
			if (typeof (game_id) != 'number') {
				continue;
			}
			
			if (tiled_type == "button") {
				for (const prop of obj ["properties"]) {
					if (prop ["name"] == "controls") {
						const controlled_tiled_id = prop ["value"];
						const controlled_game_id = id_map.get (controlled_tiled_id);
						if (typeof (controlled_game_id) != 'number') {
							continue;
						}
						
						this.buttons.set (game_id, new ButtonComponent (controlled_game_id));
					}
				}
			}
		}
		
		// Build pathfinding map
		
		this.goal_map = this.dijkstra ();
	}
	
	get_tile (x: number, y: number): TileInfo {
		const tile_x = Math.floor (x / 32);
		const tile_y = Math.floor (y / 32);
		const tile_index = tile_y * this.map_width + tile_x;
		
		return new TileInfo (this.map_data [tile_index * 4]);
	}
	
	dijkstra (): Map <number, number> {
		let goal_map: Map <number, number> = new Map ();
		let frontier_queue: Array <number []> = new Array ();
		
		// Set all goals to 0
		
		for (let y = 0; y < 32; y++) {
			for (let x = 0; x < this.map_width; x++) {
				const index = (y * this.map_width + x);
				const tile = new TileInfo (this.map_data [index * 4]);
				
				if (tile.is_goal) {
					goal_map.set (index, 0);
					frontier_queue.push ([x, y]);
				}
			}
		}
		
		// Explore frontier
		
		while (frontier_queue.length > 0) {
			const [x, y] = frontier_queue.pop ()!;
			
			const index_me = (y * this.map_width + x);
			const dist_me = goal_map.get (index_me)!;
			
			const neighbors = [
				[x - 1, y    ],
				[x + 1, y    ],
				[x    , y - 1],
				[x    , y + 1],
			];
			
			for (const [n_x, n_y] of neighbors) {
				const index_nay = n_y * this.map_width + n_x;
				const tile = new TileInfo (this.map_data [index_nay * 4]);
				
				if (! tile.lara_can_walk) {
					continue;
				}
				
				let dist_nay = goal_map.get (index_nay);
				
				if (typeof (dist_nay) == "number") {
					if (dist_nay > dist_me + 1) {
						goal_map.set (index_nay, dist_me + 1);
						frontier_queue.push ([n_x, n_y]);
					}
				}
				else {
					goal_map.set (index_nay, dist_me + 1);
					frontier_queue.push ([n_x, n_y]);
				}
			}
		}
		
		return goal_map;
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
	
	can_toggle_button (actor: number): (() => void) | null {
		const nearest_button = this.nearest_entity (actor, this.buttons, 32);
		if (typeof (nearest_button) != "number") {
			return null;
		}
		
		const button = this.buttons.get (nearest_button);
		if (! button) {
			return null;
		}
		
		const door = this.doors.get (button.door);
		if (! door) {
			return null;
		}
		
		return function () {
			door.open = true;
		};
	}
	
	can_pick_snake (actor: number): (() => void) | null {
		const holder = this.holders.get (actor);
		if (! holder) {
			return null;
		}
		if (holder.holding != null) {
			return null;
		}
		
		const nearest_snake = this.nearest_entity (actor, this.snakes, 32);
		if (typeof (nearest_snake) != "number") {
			return null;
		}
		
		const snake = this.snakes.get (nearest_snake);
		if (! snake) {
			return null;
		}
		
		return function () {
			snake.held_by = actor;
			holder.holding = nearest_snake;
		};
	}
	
	can_drop_snake (actor: number): (() => void) | null {
		const holder = this.holders.get (actor);
		if (! holder) {
			return null;
		}
		if (holder.holding == null) {
			return null;
		}
		
		const snake_e = holder.holding;
		
		const snake = this.snakes.get (snake_e);
		if (! snake) {
			return null;
		}
		
		const holder_pos = this.positions.get (actor)!;
		const snake_pos = this.positions.get (snake_e)!;
		
		return function () {
			snake.held_by = null;
			holder.holding = null;
			snake_pos.x = holder_pos.x;
			snake_pos.y = holder_pos.y;
		};
	}
}

class GameState {
	// Non-ECS stuff
	
	frame_count: number;
	button_prompt: string = "";
	frames_moved: number = 0;
	
	level_state: LevelState;
	
	constructor () {
		this.frame_count = 0;
		
		const map = TileMaps ["map_2"].layers [0];
		
		this.level_state = new LevelState (map);
	}
	
	step (cow_gamepad: CowGamepad) {
		const lvl = this.level_state;
		
		this.frame_count += 1;
		
		const kristie_pos = lvl.positions.get (lvl.kristie)!;
		
		const move_vec = cow_gamepad.move_vec ();
		
		const kristie_holder = lvl.holders.get (lvl.kristie)!;
		
		if (move_vec [0] != 0 || move_vec [1] != 0) {
			kristie_holder.dir_x = move_vec [0];
			kristie_holder.dir_y = move_vec [1];
		}
		
		const kristie_speed: number = 2.0;
		
		const kristie_new_x = kristie_pos.x + kristie_speed * move_vec [0];
		const kristie_new_y = kristie_pos.y + kristie_speed * move_vec [1];
		
		if (! (move_vec [0] == 0.0 && move_vec [1] == 0.0)) {
			this.frames_moved += 1;
		}
		
		if (lvl.get_tile (kristie_new_x, kristie_new_y).kristie_can_walk) {
			kristie_pos.x = kristie_new_x;
			kristie_pos.y = kristie_new_y;
		}
		
		let action: (() => void) | null = null;
		
		if (action === null) {
			action = lvl.can_drop_snake (lvl.kristie);
			this.button_prompt = "Space: Drop snake";
		}
		if (action === null) {
			action = lvl.can_toggle_button (lvl.kristie);
			this.button_prompt = "Space: Open door";
		}
		if (action === null) {
			action = lvl.can_pick_snake (lvl.kristie);
			this.button_prompt = "Space: Pick up snake";
		}
		if (action === null) {
			if (this.frames_moved < 30) {
				this.button_prompt = "Arrow keys: Move";
			}
			else {
				this.button_prompt = "";
			}
		}
		
		if (cow_gamepad.action_x.just_pressed && action) {
			action ();
		}
		
		for (const [entity, lara] of lvl.laras) {
			lara.fixed_step (lvl, entity);
		}
		
		for (const [entity, snake] of lvl.snakes) {
			snake.fixed_step (lvl, entity);
		}
		
		for (const [entity, snake_spawner] of lvl.snake_spawners) {
			snake_spawner.fixed_step (lvl, entity);
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
	const lvl = game_state.level_state;
	
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
		for (let x = 0; x < lvl.map_width; x++) {
			const index = y * lvl.map_width + x;
			const tile = lvl.map_data [index * 4];
			
			const info = new TileInfo (tile);
			
			if (info.sprite) {
				draw_sprite (info.sprite, x * 32, y * 32);
			}
			
			const dijkstra_num = lvl.goal_map.get (index);
			if (false && typeof (dijkstra_num) == "number") {
				ctx.font = "15px sans-serif";
				ctx.fillStyle = "#fff";
				ctx.textAlign = "center";
				
				ctx.fillText (String (dijkstra_num), x * 32 + 16, y * 32 + 20);
			}
		}
	}
	
	// Sprites from the ECS
	
	for (const [entity, sprite] of lvl.sprites) {
		const pos: PosComponent = lvl.positions.get (entity)!;
		
		if (pos == null) {
			return;
		}
		
		let name = sprite.name;
		if (sprite.name_func) {
			name = sprite.name_func ();
		}
		
		if (name === null) {
			continue;
		}
		draw_sprite (name, Math.floor (pos.x + sprite.offset_x), Math.floor (pos.y + sprite.offset_y));
	}
	
	// UI
	
	ctx.font = "20px sans-serif";
	
	const button_prompt = game_state.button_prompt;
	if (button_prompt) {
		const kristie_pos = lvl.positions.get (lvl.kristie)!;
		
		const margin = 10;
		
		const metrics = ctx.measureText (button_prompt);
		
		const half_width = metrics.width / 2 + margin;
		const half_height = 20 / 2 + margin;
		
		const x = Math.floor (Math.max (half_width, Math.min (800 - half_width, kristie_pos.x + 0)));
		const y = Math.floor (Math.max (half_height, Math.min (600 - half_height, kristie_pos.y + 40)));
		
		ctx.fillStyle = "#00000080";
		ctx.fillRect (x - half_width, y - half_height, half_width * 2, half_height * 2);
		
		ctx.fillStyle = "#fff";
		ctx.textAlign = "center";
		ctx.fillText (button_prompt, x, y + 20 * 0.25);
	}
	
	ctx.fillStyle ="#000";
	
	if (throbber_frame == 0) {
		ctx.fillRect(5, 5, 10, 10);
	}
	else {
		ctx.fillRect(15, 5, 10, 10);
	}
	
	if (! running) {
		ctx.fillStyle = "#000000a0";
		ctx.fillRect (800 / 2 - 180 / 2, 600 / 2 - 50 / 2, 180, 50);
		
		ctx.fillStyle = "#fff";
		ctx.textAlign = "center";
		ctx.fillText ("Click to resume", 800 / 2, 600 / 2 + 20 * 0.25);
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
	"cup",
	"door-glow",
	"door-staff",
	"kristie",
	"lara",
	"placeholder-button",
	"placeholder-closed-tile",
	"placeholder-door",
	"placeholder-map",
	"placeholder-open-tile",
	"snake-1",
	"snake-2",
	"tile-backrooms",
	"tile-ruins",
	"tile-ruins-crud",
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

