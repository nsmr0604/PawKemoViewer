package org.pawkemoviewer.safprobe;

// Runs on a plain JVM. Android intent flags are compile-time constants.
final class AndroidGrantProbe {
    public static void main(String[] args) {
        int read = AndroidLocalePicker.READ;
        int write = AndroidLocalePicker.WRITE;
        int persistent = AndroidLocalePicker.PERSISTABLE;
        expect(0, AndroidLocalePicker.persistableModes(read | write, read | write));
        expect(0, AndroidLocalePicker.persistableModes(persistent | read, write));
        expect(read, AndroidLocalePicker.persistableModes(persistent | read | write, read));
        expect(write, AndroidLocalePicker.persistableModes(persistent | write, read | write));
        expect(read | write, AndroidLocalePicker.persistableModes(persistent | read | write, -1));
        System.out.println("PASS: 5 SAF grant-mask cases");
    }

    private static void expect(int expected, int actual) {
        if (actual != expected) {
            throw new AssertionError("Expected " + expected + ", got " + actual);
        }
    }
}
