import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function CalculatorPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Calculator" description="Standard calculator plus everyday bench electronics tools." />
      <Tabs defaultValue="standard">
        <TabsList>
          <TabsTrigger value="standard">Standard</TabsTrigger>
          <TabsTrigger value="ohms">Ohm's Law</TabsTrigger>
          <TabsTrigger value="led">LED Resistor</TabsTrigger>
          <TabsTrigger value="resistors">Resistors</TabsTrigger>
          <TabsTrigger value="divider">Voltage Divider</TabsTrigger>
        </TabsList>
        <TabsContent value="standard"><StandardCalculator /></TabsContent>
        <TabsContent value="ohms"><OhmsLaw /></TabsContent>
        <TabsContent value="led"><LedResistor /></TabsContent>
        <TabsContent value="resistors"><Resistors /></TabsContent>
        <TabsContent value="divider"><VoltageDivider /></TabsContent>
      </Tabs>
    </div>
  );
}

function StandardCalculator() {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState("");

  function press(token: string) {
    setExpr((e) => e + token);
  }
  function clearAll() {
    setExpr("");
    setResult("");
  }
  function back() {
    setExpr((e) => e.slice(0, -1));
  }
  function equals() {
    // CSP blocks eval/Function in the Tauri webview, so evaluate with a small
    // shunting-yard parser instead.
    const value = evalExpression(expr);
    setResult(value === null ? "Error" : String(Number(value.toPrecision(12))));
  }

  const keys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "(", ")"];

  return (
    <Card className="max-w-sm">
      <CardContent className="space-y-3 pt-5">
        <div className="rounded-md border border-border bg-background p-3 text-right">
          <div className="min-h-5 break-all font-mono text-sm text-muted-foreground">{expr || "0"}</div>
          <div className="min-h-8 break-all font-mono text-2xl font-semibold tabular-nums">{result || ""}</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Button variant="outline" onClick={clearAll}>C</Button>
          <Button variant="outline" onClick={back}>DEL</Button>
          <Button variant="outline" onClick={() => press("%")}>%</Button>
          <Button variant="outline" onClick={() => press("+")}>+</Button>
          {keys.map((k) => (
            <Button key={k} variant={/[-+*/]/.test(k) ? "outline" : "secondary"} onClick={() => press(k)}>{k}</Button>
          ))}
          <Button className="col-span-4" onClick={equals}>=</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Evaluate a basic arithmetic expression (+ - * / %, parentheses, decimals)
 * without eval/Function (which the app CSP blocks). Returns null on any error.
 */
function evalExpression(input: string): number | null {
  const src = input.replace(/\s+/g, "");
  if (src === "" || !/^[-+*/().%\d]+$/.test(src)) return null;

  const tokens: string[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (/[0-9.]/.test(ch)) {
      let num = ch;
      i += 1;
      while (i < src.length && /[0-9.]/.test(src[i] as string)) {
        num += src[i];
        i += 1;
      }
      tokens.push(num);
    } else {
      tokens.push(ch);
      i += 1;
    }
  }

  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2 };
  const output: string[] = [];
  const ops: string[] = [];
  let prevType: "num" | "op" | "open" | null = null;

  for (let t = 0; t < tokens.length; t += 1) {
    const tok = tokens[t] as string;
    if (/^[0-9.]/.test(tok)) {
      output.push(tok);
      prevType = "num";
    } else if (tok === "(") {
      ops.push(tok);
      prevType = "open";
    } else if (tok === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") output.push(ops.pop() as string);
      if (!ops.length) return null;
      ops.pop();
      prevType = "num";
    } else if (tok in prec) {
      // Unary minus/plus at the start or after another operator/open paren.
      if ((tok === "-" || tok === "+") && (prevType === null || prevType === "op" || prevType === "open")) {
        output.push("0");
      }
      while (
        ops.length &&
        ops[ops.length - 1] !== "(" &&
        (prec[ops[ops.length - 1] as string] as number) >= (prec[tok] as number)
      ) {
        output.push(ops.pop() as string);
      }
      ops.push(tok);
      prevType = "op";
    } else {
      return null;
    }
  }
  while (ops.length) {
    const op = ops.pop() as string;
    if (op === "(") return null;
    output.push(op);
  }

  const stack: number[] = [];
  for (const tok of output) {
    if (/^[0-9.]/.test(tok)) {
      const n = Number(tok);
      if (!Number.isFinite(n)) return null;
      stack.push(n);
    } else {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return null;
      let r: number;
      if (tok === "+") r = a + b;
      else if (tok === "-") r = a - b;
      else if (tok === "*") r = a * b;
      else if (tok === "/") r = a / b;
      else if (tok === "%") r = a % b;
      else return null;
      stack.push(r);
    }
  }
  if (stack.length !== 1) return null;
  const result = stack[0] as number;
  return Number.isFinite(result) ? result : null;
}

function fmt(n: number, unit: string): string {
  if (!Number.isFinite(n)) return "-";
  return `${Number(n.toPrecision(6))} ${unit}`;
}

function OhmsLaw() {
  const [v, setV] = useState("");
  const [i, setI] = useState("");
  const [r, setR] = useState("");
  const [out, setOut] = useState<{ v: number; i: number; r: number; p: number } | null>(null);

  function calc() {
    const V = parseFloat(v);
    const I = parseFloat(i);
    const R = parseFloat(r);
    const has = [Number.isFinite(V), Number.isFinite(I), Number.isFinite(R)].filter(Boolean).length;
    if (has < 2) {
      setOut(null);
      return;
    }
    let rv = V, ri = I, rr = R;
    if (Number.isFinite(V) && Number.isFinite(I)) { rr = V / I; }
    else if (Number.isFinite(V) && Number.isFinite(R)) { ri = V / R; }
    else if (Number.isFinite(I) && Number.isFinite(R)) { rv = I * R; }
    setOut({ v: rv, i: ri, r: rr, p: rv * ri });
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Ohm's Law</CardTitle>
        <CardDescription>Enter any two values; the rest are computed (V = I x R, P = V x I).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <FieldInput label="Voltage (V)" value={v} onChange={setV} />
          <FieldInput label="Current (A)" value={i} onChange={setI} />
          <FieldInput label="Resistance (Ohm)" value={r} onChange={setR} />
        </div>
        <Button onClick={calc}>Calculate</Button>
        {out && (
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 text-sm">
            <Out label="Voltage" value={fmt(out.v, "V")} />
            <Out label="Current" value={fmt(out.i, "A")} />
            <Out label="Resistance" value={fmt(out.r, "Ohm")} />
            <Out label="Power" value={fmt(out.p, "W")} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LedResistor() {
  const [vs, setVs] = useState("5");
  const [vf, setVf] = useState("2");
  const [ma, setMa] = useState("20");
  const [out, setOut] = useState<{ r: number; p: number } | null>(null);

  function calc() {
    const Vs = parseFloat(vs);
    const Vf = parseFloat(vf);
    const I = parseFloat(ma) / 1000;
    if (![Vs, Vf, I].every(Number.isFinite) || I <= 0 || Vs <= Vf) {
      setOut(null);
      return;
    }
    const r = (Vs - Vf) / I;
    setOut({ r, p: (Vs - Vf) * I });
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>LED Series Resistor</CardTitle>
        <CardDescription>R = (Vsupply - Vforward) / I</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <FieldInput label="Supply (V)" value={vs} onChange={setVs} />
          <FieldInput label="LED forward (V)" value={vf} onChange={setVf} />
          <FieldInput label="Current (mA)" value={ma} onChange={setMa} />
        </div>
        <Button onClick={calc}>Calculate</Button>
        {out && (
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 text-sm">
            <Out label="Resistor" value={fmt(out.r, "Ohm")} />
            <Out label="Resistor power" value={fmt(out.p, "W")} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Resistors() {
  const [values, setValues] = useState("");
  const [out, setOut] = useState<{ series: number; parallel: number } | null>(null);

  function calc() {
    const nums = values.split(/[\s,]+/).map((s) => parseFloat(s)).filter((n) => Number.isFinite(n) && n > 0);
    if (nums.length === 0) {
      setOut(null);
      return;
    }
    const series = nums.reduce((a, b) => a + b, 0);
    const parallel = 1 / nums.reduce((a, b) => a + 1 / b, 0);
    setOut({ series, parallel });
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Series / Parallel Resistors</CardTitle>
        <CardDescription>Enter resistor values in ohms, separated by commas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Resistor values</Label>
          <Input value={values} onChange={(e) => setValues(e.target.value)} placeholder="220, 330, 1000" />
        </div>
        <Button onClick={calc}>Calculate</Button>
        {out && (
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 text-sm">
            <Out label="Series total" value={fmt(out.series, "Ohm")} />
            <Out label="Parallel total" value={fmt(out.parallel, "Ohm")} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VoltageDivider() {
  const [vin, setVin] = useState("");
  const [r1, setR1] = useState("");
  const [r2, setR2] = useState("");
  const [out, setOut] = useState<number | null>(null);

  function calc() {
    const Vin = parseFloat(vin);
    const R1 = parseFloat(r1);
    const R2 = parseFloat(r2);
    if (![Vin, R1, R2].every(Number.isFinite) || R1 + R2 === 0) {
      setOut(null);
      return;
    }
    setOut((Vin * R2) / (R1 + R2));
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Voltage Divider</CardTitle>
        <CardDescription>Vout = Vin x R2 / (R1 + R2)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <FieldInput label="Vin (V)" value={vin} onChange={setVin} />
          <FieldInput label="R1 (Ohm)" value={r1} onChange={setR1} />
          <FieldInput label="R2 (Ohm)" value={r2} onChange={setR2} />
        </div>
        <Button onClick={calc}>Calculate</Button>
        {out !== null && (
          <div className="rounded-md border border-border p-3 text-sm">
            <Out label="Output voltage" value={fmt(out, "V")} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FieldInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Out({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("flex flex-col")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </div>
  );
}
