
void FUN_004815f6(void)

{
  VirtualAlloc(DAT_004cea00,0x20000,0x1000,4);
  if (DAT_004bd894 != (code *)0x0) {
    (*DAT_004bd894)();
  }
  FUN_00481720(&PTR_LAB_0048b000,(undefined4 *)&DAT_0048b0bc);
  return;
}

