<div align="center">

# Action-bundle

**Convierte GitHub Actions en un pool de cómputo distribuido.**

[English](README.md) · [한국어](README_KO.md) · [日本語](README_JA.md) · [简体中文](README_ZH.md) · [Español](README_ES.md)

[![action-bundle](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/run.yml/badge.svg)](https://github.com/flyingsquirrel0419/Action-bundle/actions/workflows/run.yml)
[![npm version](https://img.shields.io/npm/v/action-bundle.svg)](https://www.npmjs.com/package/action-bundle)
[![license](https://img.shields.io/npm/l/action-bundle.svg)](LICENSE)

</div>

Dale una carga de trabajo a Action-bundle. GitHub Actions la ejecuta en paralelo
en muchos runners y te devuelve un único resultado verificado.

```
                 ┌─ Runner 0 ─┐
Workload ─ Split ├─ Runner 1 ─┼─ Collect ─ Verify ─ Reduce ─ Result
                 ├─ Runner 2 ─┤
                 └─ Runner N ─┘
```

La `matrix` de GitHub Actions solo crea jobs en paralelo; Action-bundle es la
capa superior que se encarga de lo que todos reescriben a mano — particionado
determinista, un manifiesto versionado por shard, un contrato de worker agnóstico
al lenguaje, recolección de artefactos, verificación de completitud y reducción —
para que nunca más diseñes la plomería del matrix.

## Inicio rápido en 30 segundos

Usa el workflow reutilizable desde cualquier repositorio (sin instalar la librería):

```yaml
# .github/workflows/distribute.yml
name: distribute
on:
  workflow_dispatch:

jobs:
  compute:
    uses: flyingsquirrel0419/Action-bundle/.github/workflows/run.yml@main
    with:
      workload: '{"kind":"index","count":2000}'
      shards: "8"
      reducer: "json-array"
```

La ejecución divide 2.000 tareas entre 8 runners, ejecuta el worker de demostración
incluido, verifica que cada tarea planificada se reportó completada exactamente
una vez —con cada resultado ligado a su shard y manifiesto— y sube
`final-result.json`. Para ejecutar **tu** código en lugar del worker de demo,
pasa `command` (y opcionalmente `reduce_command`) al mismo workflow
reutilizable; se ejecutan en un checkout de tu repositorio:

```yaml
    with:
      workload: '{"kind":"list","items":["a.py","b.py","c.py"]}'
      shards: "4"
      command: "python3 scripts/process.py"      # tu worker
      reduce_command: "python3 scripts/merge.py" # opcional: merge propio
```

Detalles en [docs/github-actions.md](docs/github-actions.md); para armar tu
propio workflow, usa la librería + CLI.

## Las piezas

| | |
|---|---|
| **Planner** | Convierte una carga de trabajo (rango de índices, lista o tareas explícitas) + número de shards (o `auto`) en un plan de ejecución determinista |
| **Partitioner** | `sha1(taskId) % shards` — misma entrada, misma asignación, siempre |
| **Manifest** | JSON versionado por shard: `{version, runId, shardIndex, shardCount, tasks}` |
| **Worker** | Tu comando, en cualquier lenguaje, con las variables `ACTION_BUNDLE_*` definidas |
| **Collector** | Descarga el `result-meta.json` de cada shard |
| **Verifier** | Falla de forma explícita ante shards o tareas faltantes/duplicadas, con detalles accionables |
| **Reducer** | `concat`, `json-array`, `json-object`, `files`, `none`, o tu propio comando |

## CLI

```bash
npm install action-bundle   # o npx action-bundle ...

# Ver cómo se dividiría una carga de trabajo
action-bundle plan workload.json --shards 8

# Los tres comandos que el workflow usa internamente
action-bundle worker --manifest manifest-0.json --command "python3 process.py" --out-dir out
action-bundle verify --parts-dir parts/ --shard-count 8 --manifests-dir manifests/
action-bundle reduce --parts-dir parts/ --shard-count 8 --strategy json-array --out result.json
```

Códigos de salida: `0` éxito · `2` configuración/uso inválido · `3` fallo de verificación · `4` fallo de ejecución/reducción.

## Librería

```ts
import { createPlan, partition, verifyShards, reduceResults } from "action-bundle";

const plan = createPlan({ workload: { kind: "index", count: 10_000 }, shards: "auto" });
```

API completa: [docs/library.md](docs/library.md). Variables de entorno del worker:
[docs/worker-contract.md](docs/worker-contract.md).

## Benchmark (medido, no promocionado)

Runners reales hospedados en GitHub, 20.000 tareas CPU-bound (~7ms cada una),
mediana de 3 ejecuciones por número de shards:

| Shards | Cómputo (shard más lento) | Tiempo total del run | Aceleración |
|---|---|---|---|
| 1 | 136s | 186s | 1.0x |
| 4 | 46s | 93s | 3.0x |
| 16 | 12s | 63s | 11.3x |

El tiempo de cómputo baja con el número de shards (limitado por el runner más
lento de la matriz); el tiempo total no, porque cada ejecución paga ~50s de
overhead fijo (arranque del runner, checkouts, setup, transferencia de
artefactos). **Fragmenta cuando el cómputo por shard se mida en
minutos, no en segundos.** Metodología y enlaces a los runs:
[benchmarks/README.md](benchmarks/README.md).

## Cuándo usarlo

Cargas de trabajo que ya pertenecen a CI y tardan lo suficiente: suites de tests
grandes, matrices de build, análisis estático sobre muchos archivos, procesamiento
por lotes de repositorios, generación de código, preparación de datos.

Cuándo **no**: jobs de menos de un minuto (domina el overhead) y cualquier cosa
fuera de las políticas de uso de GitHub — esto es para cargas legítimas del
repositorio, no una granja de cómputo gratis. Action-bundle no es
Kubernetes/Ray/Spark; es la capa fina para trabajo que ya vive en GitHub Actions.

## Documentación

- [docs/concepts.md](docs/concepts.md) — el modelo mental
- [docs/getting-started.md](docs/getting-started.md) — adóptalo en tu repo
- [docs/github-actions.md](docs/github-actions.md) — workflows, límites, workers personalizados
- [docs/cli.md](docs/cli.md) · [docs/library.md](docs/library.md)
- [docs/reducers.md](docs/reducers.md) · [docs/worker-contract.md](docs/worker-contract.md)
- [docs/architecture.md](docs/architecture.md) — por qué matrix + artifacts, sin servidor
- [docs/retries.md](docs/retries.md) — cómo se ven hoy los reintentos/resume
- [docs/security.md](docs/security.md) · [docs/troubleshooting.md](docs/troubleshooting.md)

El cuerpo de la documentación se mantiene en inglés.

## Contribuir / Seguridad / Licencia

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [MIT](LICENSE)

