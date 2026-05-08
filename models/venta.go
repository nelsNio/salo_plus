package models

import (
	"time"

	"gorm.io/gorm"
)

type Item struct {
	gorm.Model
	// Clave foránea hacia la venta dueña del item
	VentaID        uint     `json:"venta_id"`
	ProductoID     uint     `json:"producto_id"`
	Producto       Producto `gorm:"foreignKey:ProductoID" json:"producto"`
	Cantidad       int      `json:"cantidad"`
	PrecioUnitario float64  `json:"precio_unitario"`
}

// Venta guarda cada transacción de venta
type Venta struct {
	gorm.Model

	Folio uint `json:"folio"`
	// Relación 1:N con los items de la venta
	Items    []Item    `gorm:"foreignKey:VentaID;constraint:OnDelete:CASCADE" json:"items"`
	Total    float64   `json:"total"`
	TipoPago string    `json:"tipo_pago"`
	Fecha    time.Time `json:"fecha"` // guardamos como time.Time para filtrar fácilmente
}
