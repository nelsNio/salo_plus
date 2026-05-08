package models

import "gorm.io/gorm"

// SKU is the master item identified by barcode
// One SKU can have many Lots
// codigo_barras can be empty for items without barcode
// Keep non-critical product metadata here

type SKU struct {
	gorm.Model
	CodigoBarras   string `gorm:"index" json:"codigo_barras"`
	Nombre         string `json:"nombre"`
	Laboratorio    string `json:"laboratorio"`
	Presentacion   string `json:"presentacion"`
	RegistroInvima string `json:"registro_invima"`
	Activo         bool   `json:"activo"`
	Lotes          []Lote `json:"lotes"`
}
