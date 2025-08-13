package models

import "gorm.io/gorm"

// ProductoEmpaque es la tabla intermedia que relaciona productos con tipos de empaque
type ProductoEmpaque struct {
	gorm.Model
	ProductoID       uint     `json:"producto_id"`
	EmpaqueID        uint     `json:"empaque_id"`
	CodigoBarras     *string  `json:"codigo_barras,omitempty"`     // Código específico para este producto-empaque
	PrecioOverride   *float64 `json:"precio_override,omitempty"`   // Precio específico para este empaque
	
	// Relaciones
	Producto Producto `json:"producto,omitempty" gorm:"foreignKey:ProductoID"`
	Empaque  Empaque  `json:"empaque,omitempty" gorm:"foreignKey:EmpaqueID"`
}
