package models

import (
	"time"

	"gorm.io/gorm"
)

type Item struct {
	gorm.Model
	VentaID        uint     `json:"venta_id"`
	ProductoID     uint     `json:"producto_id"`
	Producto       Producto `gorm:"foreignKey:ProductoID" json:"producto"`
	Cantidad       int      `json:"cantidad"`
	PrecioUnitario float64  `json:"precio_unitario"`
	Descuento      float64  `json:"descuento"`     // monto descontado en pesos
	DescuentoPct   float64  `json:"descuento_pct"` // porcentaje (informativo)
}

type Venta struct {
	gorm.Model
	Folio           uint      `json:"folio"`
	Items           []Item    `gorm:"foreignKey:VentaID;constraint:OnDelete:CASCADE" json:"items"`
	Total           float64   `json:"total"`
	TotalDescuentos float64   `json:"total_descuentos"`
	TipoPago        string    `json:"tipo_pago"`
	Fecha           time.Time `json:"fecha"`
}
