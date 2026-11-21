import Foundation
import Tauri
import UIKit
import UniformTypeIdentifiers

private struct ExportArguments: Decodable {
    let filename: String
    let json: String
}

private final class LocalePickerPlugin: Plugin, UIDocumentPickerDelegate {
    private var pending: Invoke?
    private var exportDirectory: URL?
    private let maxBytes = 1024 * 1024

    @objc public func importLocale(_ invoke: Invoke) {
        DispatchQueue.main.async {
            guard #available(iOS 14.0, *) else {
                invoke.reject("The locale picker requires iOS 14 or later")
                return
            }
            self.present(UIDocumentPickerViewController(forOpeningContentTypes: [.json], asCopy: true), invoke)
        }
    }

    @objc public func exportLocale(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(ExportArguments.self)
        DispatchQueue.main.async {
            guard #available(iOS 14.0, *) else {
                invoke.reject("The locale picker requires iOS 14 or later")
                return
            }
            guard self.pending == nil else {
                invoke.reject("A locale picker is already open")
                return
            }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let file = directory.appendingPathComponent(args.filename)
                try Data(args.json.utf8).write(to: file, options: .atomic)
                self.exportDirectory = directory
                self.present(UIDocumentPickerViewController(forExporting: [file], asCopy: true), invoke)
            } catch {
                try? FileManager.default.removeItem(at: directory)
                invoke.reject("Could not stage the locale export")
            }
        }
    }

    private func present(_ picker: UIDocumentPickerViewController, _ invoke: Invoke) {
        guard pending == nil else {
            invoke.reject("A locale picker is already open")
            return
        }
        guard let host = manager.viewController, host.presentedViewController == nil else {
            removeExport()
            invoke.reject("Could not open the system file picker")
            return
        }
        pending = invoke
        picker.delegate = self
        picker.allowsMultipleSelection = false
        picker.modalPresentationStyle = .fullScreen
        host.present(picker, animated: true)
    }

    private func removeExport() {
        if let directory = exportDirectory {
            try? FileManager.default.removeItem(at: directory)
            exportDirectory = nil
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        let invoke = pending
        pending = nil
        removeExport()
        invoke?.resolve(["kind": "cancelled"])
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let invoke = pending else { return }
        pending = nil
        let exporting = exportDirectory != nil
        removeExport()
        guard let url = urls.first else {
            invoke.reject("No document was selected")
            return
        }
        if exporting {
            invoke.resolve(["kind": "saved"])
            return
        }
        do {
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            var data = Data()
            while let chunk = try handle.read(upToCount: 8192), !chunk.isEmpty {
                if chunk.count > maxBytes - data.count {
                    invoke.reject("Locale file exceeds 1 MiB")
                    return
                }
                data.append(chunk)
            }
            guard let json = String(data: data, encoding: .utf8) else {
                invoke.reject("Locale file is not UTF-8")
                return
            }
            invoke.resolve(["kind": "selected", "name": url.lastPathComponent, "json": json])
        } catch {
            invoke.reject("Could not read the selected locale file")
        }
    }
}

@_cdecl("init_plugin_locale_picker")
public func initPlugin() -> Plugin {
    LocalePickerPlugin()
}
