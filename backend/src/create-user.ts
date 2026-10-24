import { readConfig } from "./config.js";
import { createPool } from "./db.js";
import { hashPassword } from "./auth.js";
import { z } from "zod";
// Password comes from stdin; never command arguments, source files or logs.
const email = z.string().email().parse(process.argv[2]).toLowerCase();
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 1024) throw Error("Entrada muito longa");
}
const password = input.replace(/\r?\n$/, "");
if (password.length < 12 || password.length > 128)
  throw Error("Senha precisa ter de 12 a 128 caracteres.");
const pool = createPool(readConfig());
try {
  await pool.query("INSERT INTO users(email,password_hash) VALUES($1,$2)", [
    email,
    await hashPassword(password),
  ]);
  console.log("Usuário criado. Preferências de envio desativadas por padrão.");
} catch {
  console.error(
    "Não foi possível criar usuário. Confira conexão e se email já está cadastrado.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
