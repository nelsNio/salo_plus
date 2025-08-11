package models

import "gorm.io/gorm"

// Producto representa la estructura tal como en tu Excel
type Producto struct {
	gorm.Model
	FechaIngreso   string  `json:"fecha_ingreso"` // puedes usar string como en Excel
	Nombre         string  `json:"nombre"`
	Laboratorio    string  `json:"laboratorio"`
	Presentacion   string  `json:"presentacion"`
	Cantidad       int     `json:"cantidad"`
	PrecioUnitario float64 `json:"precio_unitario"`
	Lote           string  `json:"lote"`
	RegistroInvima string  `json:"registro_invima"`
	FechaVenc      string  `json:"fecha_venc"`
	Observacion    string  `json:"observacion"`
	CodigoBarras   string  `json:"codigo_barras"`
}
