package models

import (
	"time"

	"gorm.io/gorm"
)

// Lote representa un lote de un SKU con su propia cantidad y fechas
// La cantidad se descuenta por FIFO según fecha_venc

type Lote struct {
	gorm.Model
	SKUID        uint      `json:"sku_id"`
	SKU          SKU       `gorm:"foreignKey:SKUID" json:"sku"`
	Codigo       string    `json:"lote"` // código/lote del proveedor
	FechaIngreso time.Time `json:"fecha_ingreso"`
	FechaVenc    time.Time `json:"fecha_venc"`
	Cantidad     int       `json:"cantidad"`
	Observacion  string    `json:"observacion"`
}
