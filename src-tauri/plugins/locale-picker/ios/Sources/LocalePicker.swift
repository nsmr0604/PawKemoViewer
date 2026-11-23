import Foundation
import Tauri
import UIKit
import UniformTypeIdentifiers

private struct ImportArguments: Decodable {
    let maxBytes: Int
    let folder: String
}

private struct ExportArguments: Decodable {
    let filename: String
    let json: String
    let folder: String
    let maxBytes: Int
}

private final class LocalePickerPlugin: Plugin, UIDocumentPickerDelegate {
    private var pending: Invoke?
    private var exportDirectory: URL?
    private var importLimit = 0

    @objc public func pickJson(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(ImportArguments.self)
        DispatchQueue.main.async {
            guard #available(iOS 14.0, *) else {
                invoke.reject("The JSON picker requires iOS 14 or later")
                return
            }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json], asCopy: true)
            picker.directoryURL = try? self.filesDirectory(args.folder)
            self.present(picker, invoke, importLimit: args.maxBytes)
        }
    }

    @objc public func saveDocument(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(ExportArguments.self)
        DispatchQueue.main.async {
            guard #available(iOS 14.0, *) else {
                invoke.reject("The JSON picker requires iOS 14 or later")
                return
            }
            guard self.pending == nil else {
                invoke.reject("A JSON picker is already open")
                return
            }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let file = directory.appendingPathComponent(args.filename)
                let bytes = Data(args.json.utf8)
                guard bytes.count <= args.maxBytes else {
                    try FileManager.default.removeItem(at: directory)
                    invoke.reject("File exceeds the size limit")
                    return
                }
                try bytes.write(to: file, options: .atomic)
                let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
                picker.directoryURL = try? self.filesDirectory(args.folder)
                self.exportDirectory = directory
                self.present(picker, invoke)
            } catch {
                try? FileManager.default.removeItem(at: directory)
                invoke.reject("Could not stage the export")
            }
        }
    }

    private func filesDirectory(_ folder: String) throws -> URL {
        let manager = FileManager.default
        let documents = try manager.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = documents.appendingPathComponent(folder, isDirectory: true)
        try manager.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func present(_ picker: UIDocumentPickerViewController, _ invoke: Invoke, importLimit: Int = 0) {
        guard pending == nil else {
            invoke.reject("A JSON picker is already open")
            return
        }
        guard let host = manager.viewController, host.presentedViewController == nil else {
            removeExport()
            invoke.reject("Could not open the system file picker")
            return
        }
        self.importLimit = importLimit
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
                if chunk.count > importLimit - data.count {
                    invoke.reject("JSON file exceeds the size limit")
                    return
                }
                data.append(chunk)
            }
            guard let json = String(data: data, encoding: .utf8) else {
                invoke.reject("JSON file is not UTF-8")
                return
            }
            invoke.resolve(["kind": "selected", "name": url.lastPathComponent, "json": json])
        } catch {
            invoke.reject("Could not read the selected JSON file")
        }
    }
}

@_cdecl("init_plugin_locale_picker")
public func initPlugin() -> Plugin {
    LocalePickerPlugin()
}
