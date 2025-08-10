package models

import (
	"time"

	"gorm.io/gorm"
)

// Venta guarda cada transacción de venta
type Venta struct {
	gorm.Model
	Folio          uint      `json:"folio"`
	SKUID          *uint     `json:"sku_id,omitempty"`
	LoteID         *uint     `json:"lote_id"`
	ProductoID     uint      `json:"producto_id"`
	Producto       Producto  `gorm:"foreignKey:ProductoID" json:"producto"`
	Cantidad       int       `json:"cantidad"`
	PrecioUnitario float64   `json:"precio_unitario"`
	Total          float64   `json:"total"`
	TipoPago       string    `json:"tipo_pago"`
	Fecha          time.Time `json:"fecha"` // guardamos como time.Time para filtrar fácilmente
}
