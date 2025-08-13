package models

import "gorm.io/gorm"

// Empaque define unidades de venta para un producto (caja, tarro, blister, ampolla, etc.)
// FactorConversion indica cuántas unidades base contiene el empaque.
type Empaque struct {
	gorm.Model
	Tipo             string `json:"tipo"`             // Ej: "Cápsula", "Tableta", "Sobre", "Frasco"
	FactorConversion int    `json:"factor_conversion"` // Ej: 30 (30 cápsulas por caja)
	Descripcion      string `json:"descripcion"`      // Ej: "Caja de 30 cápsulas"
}
