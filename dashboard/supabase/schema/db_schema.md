## Table `profiles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` |  |
| `role` | `user_role` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `student_id` | `numeric` |  Nullable Unique |

## Table `student_details`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `pin_hash` | `text` |  |
| `required_hours` | `numeric` |  Nullable |
| `is_active` | `bool` |  Nullable |
| `home_lat` | `float8` |  Nullable |
| `home_long` | `float8` |  Nullable |
| `geofence_radius_meters` | `int4` |  Nullable |
| `face_encoding_vector` | `vector` |  Nullable |
| `student_id` | `numeric` |  Unique |
| `password_hash` | `text` |  Nullable |

## Table `time_logs`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `event_type` | `punch_type` |  |
| `recorded_at` | `timestamptz` |  Nullable |
| `punch_lat` | `float8` |  Nullable |
| `punch_long` | `float8` |  Nullable |
| `snapshot_url` | `text` |  Nullable |
| `verification_metadata` | `jsonb` |  Nullable |
| `is_verified` | `bool` |  Nullable |
| `student_id` | `numeric` |  Nullable |
| `id` | `uuid` | Primary |

## Table `legacy_hours`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `int8` | Primary Identity |
| `created_at` | `timestamptz` |  |
| `student_id` | `numeric` |  |
| `date` | `timestamptz` |  Nullable |
| `hours` | `numeric` |  Nullable |