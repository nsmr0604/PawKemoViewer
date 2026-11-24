import type { LocaleRepository } from "../application/locale-repository"
import type { LocaleService } from "../platform/contracts"

export function createLocaleRepository(service: LocaleService | undefined): LocaleRepository | undefined {
  if (!service) return undefined
  return {
    listPrivate: service.listExternal.bind(service),
    listSecondary: service.listSecondary?.bind(service),
    exportToFolder: service.exportToFolder?.bind(service),
    writePrivate: service.write?.bind(service),
    writeSecondary: service.writeSecondary?.bind(service),
    deletePrivate: service.delete?.bind(service),
  }
}
