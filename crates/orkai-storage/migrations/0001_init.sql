CREATE TABLE workspace (
    id    TEXT PRIMARY KEY NOT NULL,
    name  TEXT NOT NULL,
    pan_x REAL NOT NULL DEFAULT 0,
    pan_y REAL NOT NULL DEFAULT 0,
    zoom  REAL NOT NULL DEFAULT 1
);

CREATE TABLE node (
    id           TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    -- Discriminante de NodeKind, desnormalizado para filtrar sem parsear JSON.
    kind_tag     TEXT NOT NULL,
    -- NodeKind serializado. Evita migracao de schema a cada tipo de no novo.
    kind_data    TEXT NOT NULL,
    pos_x        REAL NOT NULL,
    pos_y        REAL NOT NULL,
    width        REAL NOT NULL,
    height       REAL NOT NULL,
    z_index      INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL
);

CREATE INDEX idx_node_workspace ON node (workspace_id);

CREATE TABLE connection (
    id           TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    from_node    TEXT NOT NULL REFERENCES node (id) ON DELETE CASCADE,
    to_node      TEXT NOT NULL REFERENCES node (id) ON DELETE CASCADE
);

CREATE INDEX idx_connection_workspace ON connection (workspace_id);
