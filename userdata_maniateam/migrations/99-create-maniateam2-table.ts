import { DataTypes } from "sequelize";
import type { Migration } from "../../migrate";
 
export const up: Migration = async ({ context: sequelize }) => {
    await sequelize.getQueryInterface().createTable("maniateam2", {
        id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        mapUuid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        country: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        score: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
		updatedAt: {
            type: DataTypes.DATE,
        },
        createdAt: {
            type: DataTypes.DATE,
        },
    });
};
 
export const down: Migration = async ({ context: sequelize }) => {
    await sequelize.getQueryInterface().dropTable("maniateam2");
};
 