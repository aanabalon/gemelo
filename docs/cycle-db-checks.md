## Consultas rápidas para validar ciclos en BD

Últimos ciclos (ajusta `limit` según necesidad):
```sql
select id, "tunnelId", "startReal", "endReal", "isCurrent", "dischargeTime"
from "Cycle"
order by "startReal" desc
limit 10;
```

Último watermark del procesamiento de ciclos:
```sql
select "lastProcessedTimestamp" from "CycleProcessingState";
```

Eliminar la tabla legacy (si aún existe) `CycleLogicConfig`:
```sql
-- Solo si no se ha aplicado la migración de borrado:
drop table if exists "CycleLogicConfig";
```
