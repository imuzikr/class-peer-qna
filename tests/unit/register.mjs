// node --import ./tests/unit/register.mjs --test … — 경로 해석기를 겁니다(resolve.mjs).
import { register } from "node:module";

register("./resolve.mjs", import.meta.url);
