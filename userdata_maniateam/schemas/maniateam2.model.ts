import {
    Table,
    Column,
    Model,
    PrimaryKey,
    DataType,
    NotNull,
    AllowNull,
    AutoIncrement,
} from "sequelize-typescript";

@Table({ tableName: "maniateam2", timestamps: true })
class ManiaTeam2 extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id: number | undefined;

    @AllowNull(false)
    @Column(DataType.STRING)
    mapUuid: string | undefined;

    @NotNull
    @AllowNull(false)
    @Column(DataType.STRING)
    country: string | undefined;

    @NotNull
    @AllowNull(false)
    @Column(DataType.INTEGER)
    score: number | undefined;
}

export default ManiaTeam2;
